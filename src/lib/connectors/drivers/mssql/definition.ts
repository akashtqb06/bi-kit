import { z } from 'zod';
import type { ConnectorDefinition, FieldSpec } from '../../types';
import { MssqlConnector } from './connector';

export const mssqlConfigSchema = z.object({
    host: z.string().min(1, 'Host is required').refine((h) => !h.includes('://'), {
        message: 'Host must be a hostname or IP without protocol prefix',
    }),
    port: z.number().int().min(1).max(65535).default(1433),
    database: z.string().min(1, 'Database name is required'),
    username: z.string().min(1, 'Username is required'),
    password: z.string().default(''),
    instanceName: z.string().optional(),
    encrypt: z.boolean().default(true),
    trustServerCertificate: z.boolean().default(false),
    connectTimeoutMs: z.number().int().positive().default(10000),
    queryTimeoutMs: z.number().int().positive().default(30000),
    connectionUrl: z.string().optional(),
    schemas: z.array(z.string()).default(['dbo']),
});

export type MssqlConfig = z.infer<typeof mssqlConfigSchema>;

export const mssqlFields: FieldSpec[] = [
    {
        name: 'host',
        label: 'Server Host',
        kind: 'text',
        placeholder: 'localhost or sql.example.com',
        required: true,
    },
    {
        name: 'port',
        label: 'Port',
        kind: 'number',
        default: 1433,
        required: true,
    },
    {
        name: 'database',
        label: 'Database',
        kind: 'text',
        placeholder: 'master',
        required: true,
    },
    {
        name: 'username',
        label: 'Username',
        kind: 'text',
        required: true,
    },
    {
        name: 'password',
        label: 'Password',
        kind: 'password',
        secret: true,
        required: false,
    },
    {
        name: 'instanceName',
        label: 'Instance Name',
        kind: 'text',
        advanced: true,
        placeholder: 'SQLEXPRESS',
    },
    {
        name: 'encrypt',
        label: 'Encrypt (TLS)',
        kind: 'boolean',
        default: true,
    },
    {
        name: 'trustServerCertificate',
        label: 'Trust Server Certificate',
        kind: 'boolean',
        default: false,
        advanced: true,
        helpText: 'Enable only for self-signed certificates in non-production environments.',
    },
    {
        name: 'connectionUrl',
        label: 'Connection URL (optional helper)',
        kind: 'text',
        advanced: true,
        placeholder: 'sqlserver://user:pass@host:1433?database=mydb',
    },
];

export const mssqlDefinition: ConnectorDefinition<MssqlConfig> = {
    type: 'mssql',
    label: 'SQL Server',
    category: 'sql',
    description: 'Connect to Microsoft SQL Server 2016+ or Azure SQL.',
    icon: 'Database',
    configSchema: mssqlConfigSchema,
    fields: mssqlFields,
    capabilities: {
        rawQuery: 'sql',
        dialect: 'mssql',
        operations: ['filter', 'join', 'mutate', 'summarize', 'select', 'order', 'limit'],
        supportsSchemas: true,
        supportsViews: true,
    },
    create(config, ctx) {
        return new MssqlConnector(config, ctx);
    },
};
