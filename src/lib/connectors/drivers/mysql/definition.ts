import { z } from 'zod';
import type { ConnectorDefinition, FieldSpec } from '../../types';
import { MysqlConnector } from './connector';

export const mysqlConfigSchema = z.object({
    host: z.string().min(1, 'Host is required').refine((h) => !h.includes('://'), {
        message: 'Host must be a hostname or IP without protocol prefix',
    }),
    port: z.number().int().min(1).max(65535).default(3306),
    database: z.string().min(1, 'Database name is required'),
    username: z.string().min(1, 'Username is required'),
    password: z.string().default(''),
    ssl: z.enum(['disable', 'require', 'verify-full']).default('disable'),
    caCert: z.string().optional(),
    connectTimeoutMs: z.number().int().positive().default(10000),
    queryTimeoutMs: z.number().int().positive().default(30000),
    connectionUrl: z.string().optional(),
});

export type MysqlConfig = z.infer<typeof mysqlConfigSchema>;

export const mysqlFields: FieldSpec[] = [
    {
        name: 'host',
        label: 'Host',
        kind: 'text',
        placeholder: 'localhost or mysql.example.com',
        required: true,
    },
    {
        name: 'port',
        label: 'Port',
        kind: 'number',
        default: 3306,
        required: true,
    },
    {
        name: 'database',
        label: 'Database',
        kind: 'text',
        placeholder: 'mydb',
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
        name: 'ssl',
        label: 'SSL Mode',
        kind: 'select',
        default: 'disable',
        options: [
            { label: 'Disable', value: 'disable' },
            { label: 'Require', value: 'require' },
            { label: 'Verify Full', value: 'verify-full' },
        ],
    },
    {
        name: 'caCert',
        label: 'CA Certificate',
        kind: 'textarea',
        secret: true,
        advanced: true,
    },
    {
        name: 'connectionUrl',
        label: 'Connection URL (optional helper)',
        kind: 'text',
        advanced: true,
        placeholder: 'mysql://user:pass@host:3306/db',
    },
];

export const mysqlDefinition: ConnectorDefinition<MysqlConfig> = {
    type: 'mysql',
    label: 'MySQL / MariaDB',
    category: 'sql',
    description: 'Connect to MySQL 5.7+, MySQL 8+, or MariaDB databases.',
    icon: 'Database',
    configSchema: mysqlConfigSchema,
    fields: mysqlFields,
    capabilities: {
        rawQuery: 'sql',
        dialect: 'mysql',
        operations: ['filter', 'join', 'mutate', 'summarize', 'select', 'order', 'limit'],
        supportsSchemas: false,
        supportsViews: true,
    },
    create(config, ctx) {
        return new MysqlConnector(config, ctx);
    },
};
