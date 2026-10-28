import { describe, it, expect } from 'vitest';
import {
    encryptString,
    decryptString,
    encryptSecretFields,
    decryptSecretFields,
    toPublicConfig,
    mergeStoredSecrets,
    redactSecrets,
    SECRET_SENTINEL,
} from './secrets';
import type { ConnectorDefinition } from './types';
import { z } from 'zod';

const mockDef: ConnectorDefinition = {
    type: 'test_db',
    label: 'Test DB',
    category: 'sql',
    description: 'Test Connector',
    icon: 'Database',
    configSchema: z.object({
        host: z.string(),
        password: z.string(),
        apiKey: z.string().optional(),
    }),
    fields: [
        { name: 'host', label: 'Host', kind: 'text', required: true },
        { name: 'password', label: 'Password', kind: 'password', required: true, secret: true },
        { name: 'apiKey', label: 'API Key', kind: 'password', secret: true },
    ],
    capabilities: {
        rawQuery: 'sql',
        operations: ['select'],
        supportsSchemas: false,
        supportsViews: false,
    },
    create: () => {
        throw new Error('Not implemented');
    },
};

describe('Secrets Management', () => {
    it('encrypts and decrypts string values with AES-256-GCM', () => {
        const secret = 'super_secret_db_pass_123$!%';
        const encrypted = encryptString(secret);

        expect(encrypted).toMatch(/^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
        expect(encrypted.startsWith('v1:')).toBe(true);

        const decrypted = decryptString(encrypted);
        expect(decrypted).toBe(secret);
    });

    it('encrypts only fields designated as secret in ConnectorDefinition', () => {
        const config = {
            host: 'db.internal.net',
            password: 'my-secret-password',
            apiKey: 'sk-1234567890abcdef',
        };

        const encryptedConfig = encryptSecretFields(mockDef, config);
        expect(encryptedConfig.host).toBe('db.internal.net');
        expect(typeof encryptedConfig.password).toBe('string');
        expect((encryptedConfig.password as string).startsWith('v1:')).toBe(true);
        expect((encryptedConfig.apiKey as string).startsWith('v1:')).toBe(true);

        const decryptedConfig = decryptSecretFields(mockDef, encryptedConfig);
        expect(decryptedConfig.host).toBe('db.internal.net');
        expect(decryptedConfig.password).toBe('my-secret-password');
        expect(decryptedConfig.apiKey).toBe('sk-1234567890abcdef');
    });

    it('toPublicConfig replaces secret fields with the sentinel', () => {
        const config = {
            host: 'db.internal.net',
            password: 'my-secret-password',
            apiKey: 'sk-1234567890abcdef',
        };

        const publicConfig = toPublicConfig(mockDef, config);
        expect(publicConfig.host).toBe('db.internal.net');
        expect(publicConfig.password).toBe(SECRET_SENTINEL);
        expect(publicConfig.apiKey).toBe(SECRET_SENTINEL);
    });

    it('mergeStoredSecrets preserves stored secrets when sentinel is sent on update', () => {
        const storedConfig = {
            host: 'db-old.internal.net',
            password: encryptString('old-secret-password'),
            apiKey: encryptString('old-api-key'),
        };

        // User updates host and apiKey, but keeps password untouched (sentinel)
        const userUpdate = {
            host: 'db-new.internal.net',
            password: SECRET_SENTINEL,
            apiKey: 'new-plain-api-key',
        };

        const merged = mergeStoredSecrets(mockDef, userUpdate, storedConfig);
        expect(merged.host).toBe('db-new.internal.net');
        expect(decryptString(merged.password as string)).toBe('old-secret-password');
        expect(merged.apiKey).toBe('new-plain-api-key');
    });

    it('redactSecrets sanitizes known secrets, passwords in URIs, and connection strings', () => {
        const sensitivePass = 'superSecret123';
        const rawLog = `Connection failed for postgresql://admin:${sensitivePass}@db.example.com:5432/mydb with password "${sensitivePass}"`;

        const redacted = redactSecrets(rawLog, [sensitivePass]);
        expect(redacted).not.toContain(sensitivePass);
        expect(redacted).toContain('postgresql://admin:***@db.example.com:5432/mydb');
        expect(redacted).toContain('***');
    });
});
