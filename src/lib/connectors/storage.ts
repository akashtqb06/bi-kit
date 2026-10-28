import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from '@src/lib/db/paths';
import { ConnectorError } from './errors';
import type { SchemaSnapshot } from './types';

export const FILE_MAX_MB = parseInt(process.env.FILE_MAX_MB || '100', 10);
export const FILE_MAX_BYTES = FILE_MAX_MB * 1024 * 1024;

export const SQLITE_MAGIC_HEADER = Buffer.from('SQLite format 3\0', 'utf8'); // 16 bytes
export const ZIP_MAGIC_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // 'PK\x03\x04'

/**
 * Return the root directory for managed files: DATA_DIR/files
 */
export function getManagedFilesRoot(): string {
    const root = path.join(DATA_DIR, 'files');
    if (!fs.existsSync(root)) {
        fs.mkdirSync(root, { recursive: true });
    }
    return root;
}

/**
 * Return the directory for a specific data source: DATA_DIR/files/{dataSourceId}
 */
export function getManagedDirForSource(dataSourceId: string): string {
    const root = getManagedFilesRoot();
    const sourceDir = path.join(root, dataSourceId);
    if (!fs.existsSync(sourceDir)) {
        fs.mkdirSync(sourceDir, { recursive: true });
    }
    return sourceDir;
}

/**
 * Return the relative path to data.db for a data source: files/{dataSourceId}/data.db
 */
export function getRelativeDbPath(dataSourceId: string): string {
    return path.join('files', dataSourceId, 'data.db');
}

/**
 * Return absolute path for data.db of a given data source.
 */
export function getAbsoluteDbPath(dataSourceId: string): string {
    return path.join(getManagedDirForSource(dataSourceId), 'data.db');
}

/**
 * Return the root directory for temporary preview uploads: DATA_DIR/temp-uploads
 */
export function getTempUploadsRoot(): string {
    const root = path.join(DATA_DIR, 'temp-uploads');
    if (!fs.existsSync(root)) {
        fs.mkdirSync(root, { recursive: true });
    }
    return root;
}

/**
 * Safely resolve a managed path relative to DATA_DIR.
 * Rejects paths attempting to escape DATA_DIR.
 */
export function resolveManagedPath(relativePath: string): string {
    if (!relativePath || typeof relativePath !== 'string') {
        throw new ConnectorError('Managed path must be a non-empty string.', 'INVALID_MANAGED_PATH');
    }

    const resolved = path.resolve(DATA_DIR, relativePath);
    const dataDirCanonical = fs.existsSync(DATA_DIR) ? fs.realpathSync(DATA_DIR) : path.resolve(DATA_DIR);

    // Verify it is inside DATA_DIR
    const rel = path.relative(dataDirCanonical, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new ConnectorError('Path traversal detected. File must reside inside DATA_DIR.', 'INVALID_PATH');
    }

    return resolved;
}

/**
 * Resolve local server path when ALLOW_LOCAL_SQLITE_PATHS is enabled.
 */
export function resolveLocalServerPath(serverPath: string): string {
    const allowed = process.env.ALLOW_LOCAL_SQLITE_PATHS === 'true';
    if (!allowed) {
        throw new ConnectorError('Local filesystem paths are disabled on this server.', 'LOCAL_PATHS_DISABLED');
    }

    const localRoot = path.resolve(process.cwd(), process.env.LOCAL_SQLITE_ROOT || path.join(DATA_DIR, 'local'));
    if (!fs.existsSync(localRoot)) {
        fs.mkdirSync(localRoot, { recursive: true });
    }

    const resolved = path.resolve(localRoot, serverPath);
    if (!fs.existsSync(resolved)) {
        throw new ConnectorError(`Local database file "${serverPath}" was not found.`, 'SOURCE_NOT_FOUND');
    }

    const canonicalRoot = fs.realpathSync(localRoot);
    const canonicalTarget = fs.realpathSync(resolved);

    const rel = path.relative(canonicalRoot, canonicalTarget);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new ConnectorError('Local path escapes LOCAL_SQLITE_ROOT.', 'INVALID_PATH');
    }

    return canonicalTarget;
}

/**
 * Verify file header / signature for security.
 */
export function validateFileSignature(
    filePath: string,
    expectedKind: 'sqlite' | 'excel' | 'csv'
): void {
    const stats = fs.statSync(filePath);
    if (stats.size > FILE_MAX_BYTES) {
        throw new ConnectorError(
            `File size (${(stats.size / 1024 / 1024).toFixed(1)} MB) exceeds maximum allowed size of ${FILE_MAX_MB} MB.`,
            'FILE_TOO_LARGE'
        );
    }

    const fd = fs.openSync(filePath, 'r');
    try {
        const header = Buffer.alloc(16);
        fs.readSync(fd, header, 0, 16, 0);

        if (expectedKind === 'sqlite') {
            if (!header.subarray(0, 16).equals(SQLITE_MAGIC_HEADER)) {
                throw new ConnectorError(
                    'Invalid SQLite file format. File does not contain standard SQLite header.',
                    'INVALID_SQLITE_HEADER'
                );
            }
        } else if (expectedKind === 'excel') {
            // Check for legacy .xls OLE format (magic: D0 CF 11 E0 A1 B1 1A E1)
            const oleHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
            if (header.subarray(0, 8).equals(oleHeader)) {
                throw new ConnectorError(
                    'Legacy .xls format is not supported. Please save your file as .xlsx or .xlsm.',
                    'UNSUPPORTED_EXCEL_FORMAT'
                );
            }
            if (!header.subarray(0, 4).equals(ZIP_MAGIC_HEADER)) {
                throw new ConnectorError(
                    'Invalid Excel file format. File must be a valid .xlsx or .xlsm workbook.',
                    'INVALID_EXCEL_HEADER'
                );
            }
        }
    } finally {
        fs.closeSync(fd);
    }
}

/**
 * Create a temporary upload directory for preview.
 */
export function createTempUploadDir(): { token: string; dir: string } {
    const token = crypto.randomBytes(16).toString('hex');
    const dir = path.join(getTempUploadsRoot(), token);
    fs.mkdirSync(dir, { recursive: true });
    return { token, dir };
}

/**
 * Clean up temporary upload directories older than 30 minutes.
 */
export function cleanupExpiredTempUploads(): void {
    const root = path.join(DATA_DIR, 'temp-uploads');
    if (!fs.existsSync(root)) return;

    const now = Date.now();
    const maxAgeMs = 30 * 60 * 1000;

    try {
        const entries = fs.readdirSync(root, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const fullPath = path.join(root, entry.name);
                const stat = fs.statSync(fullPath);
                if (now - stat.mtimeMs > maxAgeMs) {
                    fs.rmSync(fullPath, { recursive: true, force: true });
                }
            }
        }
    } catch {
        // ignore errors during cleanup
    }
}

export interface SchemaDiff {
    hasChanges: boolean;
    addedTables: string[];
    removedTables: string[];
    addedColumns: { table: string; column: string }[];
    removedColumns: { table: string; column: string }[];
    retypedColumns: { table: string; column: string; oldType: string; newType: string }[];
}

/**
 * Compare two SchemaSnapshots to report schema drift on file replacement.
 */
export function computeSchemaDiff(
    oldSnapshot: SchemaSnapshot | null | undefined,
    newSnapshot: SchemaSnapshot
): SchemaDiff {
    const diff: SchemaDiff = {
        hasChanges: false,
        addedTables: [],
        removedTables: [],
        addedColumns: [],
        removedColumns: [],
        retypedColumns: [],
    };

    if (!oldSnapshot || !oldSnapshot.tables) {
        if (newSnapshot.tables.length > 0) diff.hasChanges = true;
        return diff;
    }

    const oldTableMap = new Map(oldSnapshot.tables.map((t) => [t.name, t]));
    const newTableMap = new Map(newSnapshot.tables.map((t) => [t.name, t]));

    for (const [name] of newTableMap) {
        if (!oldTableMap.has(name)) {
            diff.addedTables.push(name);
        }
    }

    for (const [name, oldTable] of oldTableMap) {
        const newTable = newTableMap.get(name);
        if (!newTable) {
            diff.removedTables.push(name);
            continue;
        }

        const oldColMap = new Map(oldTable.columns.map((c) => [c.name, c]));
        const newColMap = new Map(newTable.columns.map((c) => [c.name, c]));

        for (const [colName, newCol] of newColMap) {
            const oldCol = oldColMap.get(colName);
            if (!oldCol) {
                diff.addedColumns.push({ table: name, column: colName });
            } else if (oldCol.type !== newCol.type) {
                diff.retypedColumns.push({
                    table: name,
                    column: colName,
                    oldType: oldCol.type,
                    newType: newCol.type,
                });
            }
        }

        for (const [colName] of oldColMap) {
            if (!newColMap.has(colName)) {
                diff.removedColumns.push({ table: name, column: colName });
            }
        }
    }

    diff.hasChanges =
        diff.addedTables.length > 0 ||
        diff.removedTables.length > 0 ||
        diff.addedColumns.length > 0 ||
        diff.removedColumns.length > 0 ||
        diff.retypedColumns.length > 0;

    return diff;
}
