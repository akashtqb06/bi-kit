import { z } from 'zod';
import type { ConnectorDefinition, FieldSpec } from '../../types';
import { PostgresConnector } from './connector';

export const postgresConfigSchema = z.object({
    host: z.string().min(1, 'Host is required').refine((h) => !h.includes('://'), {
        message: 'Host must be a hostname or IP without protocol prefix',
    }),
    port: z.number().int().min(1).max(65535).default(5432),
    database: z.string().min(1, 'Database name is required'),
    username: z.string().min(1, 'Username is required'),
    password: z.string().default(''),
    ssl: z.enum(['disable', 'require', 'verify-full']).default('disable'),
    caCert: z.string().optional(),
    connectTimeoutMs: z.number().int().positive().default(10000),
    queryTimeoutMs: z.number().int().positive().default(30000),
    connectionUrl: z.string().optional(),
    schemas: z.array(z.string()).default(['public']),
});

export type PostgresConfig = z.infer<typeof postgresConfigSchema>;

export const postgresFields: FieldSpec[] = [
    {
        name: 'host',
        label: 'Host',
        kind: 'text',
        placeholder: 'localhost or db.example.com',
        required: true,
    },
    {
        name: 'port',
        label: 'Port',
        kind: 'number',
        default: 5432,
        required: true,
    },
    {
        name: 'database',
        label: 'Database',
        kind: 'text',
        placeholder: 'postgres',
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
        placeholder: '-----BEGIN CERTIFICATE-----\n...',
    },
    {
        name: 'connectionUrl',
        label: 'Connection URL (optional helper)',
        kind: 'text',
        advanced: true,
        placeholder: 'postgres://user:pass@host:5432/db',
    },
];

export const postgresDefinition: ConnectorDefinition<PostgresConfig> = {
    type: 'postgres',
    label: 'PostgreSQL',
    category: 'sql',
    description: 'Connect to PostgreSQL 12+ database instances.',
    icon: 'Database',
    configSchema: postgresConfigSchema,
    fields: postgresFields,
    capabilities: {
        rawQuery: 'sql',
        dialect: 'postgres',
        operations: ['filter', 'join', 'mutate', 'summarize', 'select', 'order', 'limit'],
        supportsSchemas: true,
        supportsViews: true,
    },
    create(config, ctx) {
        return new PostgresConnector(config, ctx);
    },
};
