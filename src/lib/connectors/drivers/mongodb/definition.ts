import { z } from 'zod';
import type { ConnectorDefinition, FieldSpec } from '../../types';
import { MongoConnector } from './connector';

export const mongoConfigSchema = z.object({
    mode: z.enum(['host', 'uri']).default('host'),

    // Host mode fields
    host: z
        .string()
        .regex(/^[^/:]+$/, 'Host must be a hostname or IP without schemes, slashes, or ports')
        .optional(),
    port: z.number().int().min(1).max(65535).default(27017),
    database: z.string().min(1, 'Database name is required'),
    username: z.string().optional(),
    password: z.string().optional(),
    authSource: z.string().default('admin'),
    replicaSet: z.string().optional(),
    ssl: z.boolean().default(false),
    caCert: z.string().optional(),

    // URI mode fields
    connectionString: z
        .string()
        .regex(/^mongodb(\+srv)?:\/\//, 'Connection string must start with mongodb:// or mongodb+srv://')
        .optional(),

    // Connection pooling and timeout options
    serverSelectionTimeoutMS: z.number().int().min(1000).max(60000).default(10000),
    maxPoolSize: z.number().int().min(1).max(50).default(5),
    readPreference: z
        .enum(['primary', 'primaryPreferred', 'secondary', 'secondaryPreferred', 'nearest'])
        .default('secondaryPreferred'),
    queryTimeoutMs: z.number().int().min(1000).max(300000).default(30000),
    sampleSize: z.number().int().min(10).max(10000).default(1000),
}).refine(
    (data) => {
        if (data.mode === 'host' && !data.host) {
            return false;
        }
        if (data.mode === 'uri' && !data.connectionString) {
            return false;
        }
        return true;
    },
    {
        message: 'Host is required in host mode; connection string is required in connection string mode.',
    }
);

export type MongoConfig = z.infer<typeof mongoConfigSchema>;

const fields: FieldSpec[] = [
    {
        name: 'mode',
        label: 'Connection Mode',
        kind: 'select',
        default: 'host',
        options: [
            { label: 'Host & Port', value: 'host' },
            { label: 'Connection String (URI)', value: 'uri' },
        ],
        required: true,
    },
    {
        name: 'host',
        label: 'Host',
        kind: 'text',
        placeholder: 'localhost or db.internal.net',
        required: true,
        showIf: { field: 'mode', equals: 'host' },
    },
    {
        name: 'port',
        label: 'Port',
        kind: 'number',
        default: 27017,
        required: true,
        showIf: { field: 'mode', equals: 'host' },
    },
    {
        name: 'database',
        label: 'Database',
        kind: 'text',
        placeholder: 'bikit_dev',
        required: true,
    },
    {
        name: 'username',
        label: 'Username',
        kind: 'text',
        placeholder: 'mongoadmin',
        showIf: { field: 'mode', equals: 'host' },
    },
    {
        name: 'password',
        label: 'Password',
        kind: 'password',
        secret: true,
        showIf: { field: 'mode', equals: 'host' },
    },
    {
        name: 'authSource',
        label: 'Auth Source',
        kind: 'text',
        default: 'admin',
        advanced: true,
        showIf: { field: 'mode', equals: 'host' },
    },
    {
        name: 'replicaSet',
        label: 'Replica Set',
        kind: 'text',
        advanced: true,
        showIf: { field: 'mode', equals: 'host' },
    },
    {
        name: 'ssl',
        label: 'Enable TLS / SSL',
        kind: 'boolean',
        default: false,
        showIf: { field: 'mode', equals: 'host' },
    },
    {
        name: 'caCert',
        label: 'CA Certificate (PEM)',
        kind: 'textarea',
        secret: true,
        advanced: true,
        showIf: { field: 'mode', equals: 'host' },
    },
    {
        name: 'connectionString',
        label: 'Connection String (URI)',
        kind: 'password',
        secret: true,
        placeholder: 'mongodb://user:password@localhost:27017/bikit_dev?authSource=admin',
        required: true,
        showIf: { field: 'mode', equals: 'uri' },
    },
    {
        name: 'readPreference',
        label: 'Read Preference',
        kind: 'select',
        default: 'secondaryPreferred',
        options: [
            { label: 'Secondary Preferred (Recommended for BI)', value: 'secondaryPreferred' },
            { label: 'Secondary', value: 'secondary' },
            { label: 'Primary Preferred', value: 'primaryPreferred' },
            { label: 'Primary', value: 'primary' },
            { label: 'Nearest', value: 'nearest' },
        ],
        advanced: true,
    },
    {
        name: 'sampleSize',
        label: 'Schema Inference Sample Size',
        kind: 'number',
        default: 1000,
        advanced: true,
        helpText: 'Number of documents sampled per collection to infer fields and types.',
    },
    {
        name: 'queryTimeoutMs',
        label: 'Query Timeout (ms)',
        kind: 'number',
        default: 30000,
        advanced: true,
    },
];

export const mongoDefinition: ConnectorDefinition = {
    type: 'mongodb',
    label: 'MongoDB',
    category: 'nosql',
    description: 'Connect to MongoDB document databases with native aggregation pipelines',
    icon: 'Layers',
    configSchema: mongoConfigSchema,
    fields,
    capabilities: {
        rawQuery: 'mongo-pipeline',
        operations: ['select', 'filter', 'join', 'mutate', 'summarize', 'order', 'limit'],
        supportsSchemas: false,
        supportsViews: true,
    },
    create: (config, ctx) => new MongoConnector(config as MongoConfig, ctx),
};

