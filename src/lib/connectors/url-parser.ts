/**
 * Client-safe connection URL parser for SQL and MongoDB connectors.
 * Parses pasted URLs directly in the browser without sending or storing
 * the raw connection string.
 */

export interface ParsedConnectionFields {
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    ssl?: 'disable' | 'require' | 'verify-full';
    tls?: boolean;
    authSource?: string;
    replicaSet?: string;
    options?: Record<string, string>;
}

export function parseConnectionUrl(
    urlString: string,
    connectorType: string
): { success: true; fields: ParsedConnectionFields } | { success: false; error: string } {
    const trimmed = urlString.trim();
    if (!trimmed) {
        return { success: false, error: 'Connection string is empty' };
    }

    try {
        // Standardize custom schemes for URL parser if needed
        let parseableUrl = trimmed;
        if (parseableUrl.startsWith('mongodb+srv://')) {
            parseableUrl = 'http://' + parseableUrl.slice('mongodb+srv://'.length);
        } else if (parseableUrl.includes('://')) {
            const schemeEnd = parseableUrl.indexOf('://');
            parseableUrl = 'http://' + parseableUrl.slice(schemeEnd + 3);
        } else {
            parseableUrl = 'http://' + parseableUrl;
        }

        const url = new URL(parseableUrl);
        const fields: ParsedConnectionFields = {};

        // 1. Host and Port
        if (url.hostname) {
            fields.host = decodeURIComponent(url.hostname);
        }
        if (url.port) {
            const parsedPort = parseInt(url.port, 10);
            if (!Number.isNaN(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
                fields.port = parsedPort;
            }
        }

        // Default ports if not specified
        if (!fields.port) {
            if (connectorType === 'postgres' || connectorType === 'postgresql') fields.port = 5432;
            else if (connectorType === 'mysql') fields.port = 3306;
            else if (connectorType === 'mssql') fields.port = 1433;
            else if (connectorType === 'mongodb') fields.port = 27017;
        }

        // 2. Database (pathname without leading slash)
        if (url.pathname && url.pathname.length > 1) {
            fields.database = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
        }

        // 3. User & Password
        if (url.username) {
            fields.username = decodeURIComponent(url.username);
        }
        if (url.password) {
            fields.password = decodeURIComponent(url.password);
        }

        // 4. Query params / SSL options
        const searchParams = url.searchParams;

        if (connectorType === 'postgres' || connectorType === 'postgresql') {
            const sslmode = searchParams.get('sslmode')?.toLowerCase();
            if (sslmode === 'disable' || sslmode === 'require' || sslmode === 'verify-full') {
                fields.ssl = sslmode;
            } else if (searchParams.get('ssl') === 'true') {
                fields.ssl = 'require';
            }
        } else if (connectorType === 'mysql') {
            const ssl = searchParams.get('ssl')?.toLowerCase();
            if (ssl === 'true' || ssl === 'required') {
                fields.ssl = 'require';
            } else if (ssl === 'verify-full') {
                fields.ssl = 'verify-full';
            } else if (ssl === 'false' || ssl === 'disable') {
                fields.ssl = 'disable';
            }
        } else if (connectorType === 'mssql') {
            const encrypt = searchParams.get('encrypt')?.toLowerCase();
            if (encrypt === 'true') {
                fields.ssl = 'require';
            } else if (encrypt === 'false') {
                fields.ssl = 'disable';
            }
            const dbName = searchParams.get('database') || searchParams.get('databaseName');
            if (dbName && !fields.database) {
                fields.database = dbName;
            }
        } else if (connectorType === 'mongodb') {
            if (trimmed.startsWith('mongodb+srv://') || searchParams.get('tls') === 'true' || searchParams.get('ssl') === 'true') {
                fields.tls = true;
            }
            const authSource = searchParams.get('authSource');
            if (authSource) fields.authSource = authSource;
            const replicaSet = searchParams.get('replicaSet');
            if (replicaSet) fields.replicaSet = replicaSet;
        }

        if (!fields.host) {
            return { success: false, error: 'Could not extract host from connection string.' };
        }

        return { success: true, fields };
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Invalid connection URL format',
        };
    }
}

