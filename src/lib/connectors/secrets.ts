import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '@src/lib/db/paths';
import { ConnectorError } from './errors';
import type { ConnectorDefinition } from './types';

export const SECRET_SENTINEL = '••••••••';

let devKeyWarningLogged = false;
let cachedKey: Buffer | null = null;

/**
 * Reset cached key (useful for unit testing different environment configs).
 */
export function _resetSecretKeyCache(): void {
    cachedKey = null;
    devKeyWarningLogged = false;
}

/**
 * Retrieve the 32-byte secret key for AES-256-GCM encryption.
 */
export function getSecretKey(): Buffer {
    if (cachedKey) {
        return cachedKey;
    }

    const envKey = process.env.CONNECTOR_SECRET_KEY?.trim();
    if (envKey) {
        try {
            const buf = Buffer.from(envKey, 'base64');
            if (buf.length === 32) {
                cachedKey = buf;
                return cachedKey;
            }
        } catch {
            // fallthrough
        }
        throw new ConnectorError(
            'CONNECTOR_SECRET_KEY must be a valid 32-byte base64-encoded string.',
            'INVALID_SECRET_KEY'
        );
    }

    if (process.env.NODE_ENV === 'production') {
        throw new ConnectorError(
            'CONNECTOR_SECRET_KEY is required in production environments.',
            'MISSING_SECRET_KEY'
        );
    }

    // Development or test mode: auto-generate or reuse .dev-secret-key in DATA_DIR
    const keyPath = path.join(DATA_DIR, '.dev-secret-key');
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        if (fs.existsSync(keyPath)) {
            const fileContent = fs.readFileSync(keyPath, 'utf8').trim();
            const buf = Buffer.from(fileContent, 'base64');
            if (buf.length === 32) {
                cachedKey = buf;
                return cachedKey;
            }
        }
    } catch {
        // fallthrough to generate
    }

    const newKey = crypto.randomBytes(32);
    try {
        fs.writeFileSync(keyPath, newKey.toString('base64'), { encoding: 'utf8', mode: 0o600 });
        if (!devKeyWarningLogged) {
            console.warn(
                '[connectors] Warning: CONNECTOR_SECRET_KEY is not set. Generated a development key in data/.dev-secret-key. Do not use this key in production.'
            );
            devKeyWarningLogged = true;
        }
    } catch (err) {
        console.warn('[connectors] Could not persist .dev-secret-key:', err);
    }

    cachedKey = newKey;
    return cachedKey;
}

/**
 * Encrypt a plaintext string into a v1:<iv>:<tag>:<ciphertext> base64url envelope.
 */
export function encryptString(plaintext: string): string {
    if (!plaintext) return plaintext;
    const key = getSecretKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

/**
 * Decrypt a v1:<iv>:<tag>:<ciphertext> envelope back to plaintext string.
 */
export function decryptString(envelope: string): string {
    if (!envelope || !envelope.startsWith('v1:')) {
        return envelope;
    }

    const parts = envelope.split(':');
    if (parts.length !== 4) {
        throw new ConnectorError('Malformed encrypted secret envelope.', 'INVALID_ENVELOPE');
    }

    const [, ivStr, tagStr, cipherStr] = parts;
    const iv = Buffer.from(ivStr, 'base64url');
    const tag = Buffer.from(tagStr, 'base64url');
    const ciphertext = Buffer.from(cipherStr, 'base64url');

    try {
        const key = getSecretKey();
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return plaintext.toString('utf8');
    } catch {
        throw new ConnectorError('Failed to decrypt secret field.', 'DECRYPTION_FAILED');
    }
}

/**
 * Encrypt all fields in config that are marked as secret in the definition.
 */
export function encryptSecretFields(
    definition: ConnectorDefinition | null | undefined,
    config: Record<string, unknown>
): Record<string, unknown> {
    const result = { ...config };
    if (!definition) return result;

    for (const field of definition.fields) {
        if (field.secret && typeof result[field.name] === 'string') {
            const raw = result[field.name] as string;
            if (raw && !raw.startsWith('v1:')) {
                result[field.name] = encryptString(raw);
            }
        }
    }
    return result;
}

/**
 * Decrypt all fields in config that are marked as secret in the definition.
 */
export function decryptSecretFields(
    definition: ConnectorDefinition | null | undefined,
    config: Record<string, unknown>
): Record<string, unknown> {
    const result = { ...config };
    if (!definition) return result;

    for (const field of definition.fields) {
        if (field.secret && typeof result[field.name] === 'string') {
            const raw = result[field.name] as string;
            if (raw && raw.startsWith('v1:')) {
                result[field.name] = decryptString(raw);
            }
        }
    }
    return result;
}

/**
 * Produce a safe public configuration replacing secret fields with SECRET_SENTINEL.
 */
export function toPublicConfig(
    definition: ConnectorDefinition | null | undefined,
    config: Record<string, unknown>
): Record<string, unknown> {
    const result = { ...config };
    // Never expose raw filesystem paths to API clients
    delete result.path;
    delete result.managedPath;
    delete result.sourcePath;
    delete result.serverPath;

    if (!definition) return result;

    for (const field of definition.fields) {
        if (field.secret) {
            const val = result[field.name];
            if (val !== undefined && val !== null && val !== '') {
                result[field.name] = SECRET_SENTINEL;
            }
        }
    }
    return result;
}

/**
 * On config update, if a secret field equals SECRET_SENTINEL, retain the stored value.
 */
export function mergeStoredSecrets(
    definition: ConnectorDefinition | null | undefined,
    incomingConfig: Record<string, unknown>,
    storedConfig: Record<string, unknown>
): Record<string, unknown> {
    const result = { ...incomingConfig };
    if (!definition) return result;

    for (const field of definition.fields) {
        if (field.secret) {
            const val = result[field.name];
            if (val === SECRET_SENTINEL || val === '__secret__') {
                result[field.name] = storedConfig[field.name];
            }
        }
    }
    return result;
}

/**
 * Redactor that scrubs passwords, secret envelopes, URLs with credentials,
 * and specific secret strings from error or log text.
 */
export function redactSecrets(text: string, knownSecrets?: string[]): string {
    if (!text || typeof text !== 'string') return text;
    let redacted = text;

    // 1. Scrub explicit known secrets
    if (knownSecrets) {
        for (const secret of knownSecrets) {
            if (secret && typeof secret === 'string' && secret.length >= 3) {
                const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                redacted = redacted.replace(new RegExp(escaped, 'g'), '***');
            }
        }
    }

    // 2. Scrub credentials in URLs (e.g. postgres://user:password@host)
    redacted = redacted.replace(
        /([a-zA-Z0-9+.-]+:\/\/)([^:]+):([^@\s]+)@/g,
        '$1$2:***@'
    );

    // 3. Scrub secret envelopes
    redacted = redacted.replace(/v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+/g, '***');

    // 4. Scrub standard password / token query or key-value pairs
    redacted = redacted.replace(
        /(password|pwd|secret|token|apiKey|api_key)\s*[:=]\s*['"]?([^\s,'";&]+)['"]?/gi,
        '$1=***'
    );

    return redacted;
}
