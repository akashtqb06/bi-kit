import { z } from 'zod';
import type { ConnectorDefinition, FieldSpec } from '../../types';
import { ExcelConnector } from './connector';

export const excelConfigSchema = z.object({
    managedPath: z.string().optional(),
    path: z.string().optional(),
    sourcePath: z.string().optional(),
    fileName: z.string().optional(),
    size: z.number().optional(),
    sheets: z
        .array(
            z.object({
                sheetName: z.string(),
                tableName: z.string(),
                rowCount: z.number(),
                columnCount: z.number(),
                columns: z.array(z.object({ name: z.string(), type: z.string() })).optional(),
            })
        )
        .optional(),
    importedAt: z.string().optional(),
});

export type ExcelConfig = z.infer<typeof excelConfigSchema>;

export const excelFields: FieldSpec[] = [
    {
        name: 'file',
        label: 'Excel Workbook File',
        kind: 'file',
        required: true,
        helpText: 'Upload an Excel (.xlsx or .xlsm) workbook (up to 100 MB).',
    },
];

export const excelDefinition: ConnectorDefinition<ExcelConfig> = {
    type: 'excel',
    label: 'Excel Workbook',
    category: 'file',
    description: 'Query multiple worksheets as tables from an uploaded Excel workbook.',
    icon: 'Sheet',
    configSchema: excelConfigSchema,
    fields: excelFields,
    capabilities: {
        rawQuery: 'sql',
        dialect: 'sqlite',
        operations: ['filter', 'join', 'mutate', 'summarize', 'select', 'order', 'limit'],
        supportsSchemas: false,
        supportsViews: false,
    },
    create(config, ctx) {
        return new ExcelConnector(config, ctx);
    },
};
