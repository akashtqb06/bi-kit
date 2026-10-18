import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const COST = 2 ** 15;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const SALT_LENGTH = 16;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

function deriveKey(
    password: string,
    salt: Buffer,
    cost: number,
    blockSize: number,
    parallelization: number
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scryptCallback(
            password,
            salt,
            KEY_LENGTH,
            { N: cost, r: blockSize, p: parallelization, maxmem: MAX_MEMORY },
            (error, key) => {
                if (error) reject(error);
                else resolve(key as Buffer);
            }
        );
    });
}

function parseHash(encoded: string): {
    cost: number;
    blockSize: number;
    parallelization: number;
    salt: Buffer;
    key: Buffer;
} | null {
    const [algorithm, costText, blockSizeText, parallelizationText, saltText, keyText] = encoded.split('$');
    const cost = Number(costText);
    const blockSize = Number(blockSizeText);
    const parallelization = Number(parallelizationText);
    if (
        algorithm !== 'scrypt' ||
        !Number.isSafeInteger(cost) ||
        !Number.isSafeInteger(blockSize) ||
        !Number.isSafeInteger(parallelization) ||
        cost < 2 ||
        blockSize < 1 ||
        parallelization < 1 ||
        !saltText ||
        !keyText
    ) {
        return null;
    }

    const salt = Buffer.from(saltText, 'base64url');
    const key = Buffer.from(keyText, 'base64url');
    if (salt.length === 0 || key.length !== KEY_LENGTH) return null;

    return { cost, blockSize, parallelization, salt, key };
}

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const key = await deriveKey(password, salt, COST, BLOCK_SIZE, PARALLELIZATION);
    return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
    const parsed = parseHash(encoded);
    if (!parsed) return false;

    const key = await deriveKey(password, parsed.salt, parsed.cost, parsed.blockSize, parsed.parallelization);
    return timingSafeEqual(key, parsed.key);
}

export function needsRehash(encoded: string): boolean {
    const parsed = parseHash(encoded);
    return (
        parsed === null ||
        parsed.cost !== COST ||
        parsed.blockSize !== BLOCK_SIZE ||
        parsed.parallelization !== PARALLELIZATION
    );
}
