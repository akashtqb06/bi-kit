import { z } from 'zod';
import type { ConnectorDefinition, FieldSpec } from '../../types';
import { DatastoreConnector } from './connector';

export const datastoreConfigSchema = z.object({
    isBuiltin: z.boolean().default(true),
    userId: z.string().optional(),
});

export type DatastoreConfig = z.infer<typeof datastoreConfigSchema>;

export const datastoreFields: FieldSpec[] = [];

export const datastoreDefinition: ConnectorDefinition<DatastoreConfig> = {
    type: 'datastore',
    label: 'Data Store',
    category: 'builtin' as unknown as 'sql',
    description: 'Built-in local analytical storage with user-isolated schemas.',
    icon: 'HardDrive',
    configSchema: datastoreConfigSchema,
    fields: datastoreFields,
    capabilities: {
        rawQuery: null, // Raw SQL mode is disabled for security
        dialect: 'postgres',
        operations: ['filter', 'join', 'mutate', 'summarize', 'select', 'order', 'limit'],
        supportsSchemas: false,
        supportsViews: false,
    },
    create(config: DatastoreConfig, ctx) {
        return new DatastoreConnector(config, ctx);
    },
};

