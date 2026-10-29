import { registerConnector } from '../../registry';
import { financeDefinition } from './definition';
import { FinanceConnector } from './connector';

// Self-register finance definition in global connector registry
registerConnector(financeDefinition);

export { financeDefinition, FinanceConnector };
export type { FinanceConfig } from './definition';

