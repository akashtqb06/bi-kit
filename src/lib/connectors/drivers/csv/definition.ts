import { z } from 'zod';
import type { ConnectorDefinition, FieldSpec } from '../../types';
import { CsvConnector } from './connector';

export const csvConfigSchema = z.object({
    managedPath: z.string().optional(),
    dbPath: z.string().optional(),
    path: z.string().optional(),
    tableName: z.string().optional(),
    originalFileName: z.string().optional(),
    fileName: z.string().optional(),
    rowCount: z.number().int().nonnegative().optional(),
    delimiter: z.string().optional(),
    encoding: z.string().optional(),
    hasHeaderRow: z.boolean().optional(),
    importedAt: z.string().optional(),
});

export type CsvConfig = z.infer<typeof csvConfigSchema>;

export const csvFields: FieldSpec[] = [
    {
        name: 'file',
        label: 'CSV File',
        kind: 'file',
        required: true,
        helpText: 'Upload a delimited CSV or text file (up to 100 MB).',
    },
    {
        name: 'delimiter',
        label: 'Delimiter',
        kind: 'text',
        default: ',',
        placeholder: 'Auto-detect (, ; tab |)',
        advanced: true,
    },
    {
        name: 'encoding',
        label: 'Encoding',
        kind: 'text',
        default: 'utf-8',
        advanced: true,
    },
    {
        name: 'hasHeaderRow',
        label: 'First row is header',
        kind: 'boolean',
        default: true,
        advanced: true,
    },
];

export const csvDefinition: ConnectorDefinition<CsvConfig> = {
    type: 'csv',
    label: 'CSV File',
    category: 'file',
    description: 'Query delimited tabular data from an uploaded CSV file.',
    icon: 'FileSpreadsheet',
    configSchema: csvConfigSchema,
    fields: csvFields,
    capabilities: {
        rawQuery: 'sql',
        dialect: 'sqlite',
        operations: ['filter', 'join', 'mutate', 'summarize', 'select', 'order', 'limit'],
        supportsSchemas: false,
        supportsViews: false,
    },
    create(config, ctx) {
        return new CsvConnector(config, ctx);
    },
};
