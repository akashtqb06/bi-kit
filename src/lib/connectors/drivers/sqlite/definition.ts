import { z } from 'zod';
import type { ConnectorDefinition, FieldSpec } from '../../types';
import { SqliteConnector } from './connector';

export const sqliteConfigSchema = z.object({
    managedPath: z.string().optional(),
    path: z.string().optional(),
    serverPath: z.string().optional(),
    fileName: z.string().optional(),
    size: z.number().optional(),
    importedAt: z.string().optional(),
});

export type SqliteConfig = z.infer<typeof sqliteConfigSchema>;

export const sqliteFields: FieldSpec[] = [
    {
        name: 'file',
        label: 'SQLite Database File',
        kind: 'file',
        required: true,
        helpText: 'Upload a valid SQLite .db, .sqlite, or .sqlite3 database file.',
    },
    ...(process.env.ALLOW_LOCAL_SQLITE_PATHS === 'true'
        ? [
              {
                  name: 'serverPath',
                  label: 'Server File Path',
                  kind: 'text' as const,
                  advanced: true,
                  placeholder: 'my-db.db (relative to LOCAL_SQLITE_ROOT)',
                  helpText: 'Dev convenience: specify a server path inside LOCAL_SQLITE_ROOT.',
              },
          ]
        : []),
];

export const sqliteDefinition: ConnectorDefinition<SqliteConfig> = {
    type: 'sqlite',
    label: 'SQLite Database',
    category: 'file',
    description: 'Query tables and views directly from an uploaded SQLite database file.',
    icon: 'Database',
    configSchema: sqliteConfigSchema,
    fields: sqliteFields,
    capabilities: {
        rawQuery: 'sql',
        dialect: 'sqlite',
        operations: ['filter', 'join', 'mutate', 'summarize', 'select', 'order', 'limit'],
        supportsSchemas: false,
        supportsViews: true,
    },
    create(config, ctx) {
        return new SqliteConnector(config, ctx);
    },
};
