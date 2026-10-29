import { z } from 'zod';
import type { ConnectorDefinition, FieldSpec } from '../../types';
import { FinanceConnector } from './connector';

export const financeConfigSchema = z.object({
    isBuiltin: z.boolean().default(true),
    userId: z.string().optional(),
});

export type FinanceConfig = z.infer<typeof financeConfigSchema>;

export const financeFields: FieldSpec[] = [];

export const financeDefinition: ConnectorDefinition<FinanceConfig> = {
    type: 'finance',
    label: 'Personal Finance',
    category: 'builtin' as unknown as 'sql',
    description: 'Built-in personal finance data source with scoped virtual tables.',
    icon: 'Wallet',
    configSchema: financeConfigSchema,
    fields: financeFields,
    capabilities: {
        rawQuery: null, // Raw SQL mode is disabled for security
        dialect: 'postgres',
        operations: ['filter', 'join', 'mutate', 'summarize', 'select', 'order', 'limit'],
        supportsSchemas: false,
        supportsViews: true,
        // @ts-expect-error extension for virtual tables declaration
        virtualTables: true,
    },
    create(config: FinanceConfig, ctx) {
        return new FinanceConnector(config, ctx);
    },
};

