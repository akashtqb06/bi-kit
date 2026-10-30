import { NotImplementedError } from '@src/app/api/utils';
import type {
  AccountDTO,
  AccountFilters,
  BudgetDTO,
  BudgetFilters,
  BudgetProgressDTO,
  CategoryDTO,
  CategoryFilters,
  CreateAccountDTO,
  CreateBudgetDTO,
  CreateCategoryDTO,
  CreateRecurringRuleDTO,
  CreateTransactionDTO,
  CreateValuationDTO,
  NetWorthHistoryQuery,
  NetWorthPointDTO,
  OverviewStatsDTO,
  OverviewStatsQuery,
  PaginatedTransactionsResponse,
  RecurringRuleDTO,
  TransactionDTO,
  TransactionFilters,
  UpdateAccountDTO,
  UpdateBudgetDTO,
  UpdateCategoryDTO,
  UpdateRecurringRuleDTO,
  UpdateTransactionDTO,
  ValuationDTO,
  ValuationFilters,
} from './contract';

export { NotImplementedError };

export interface FinanceService {
  // Accounts
  listAccounts(userId: string, filters?: AccountFilters): Promise<AccountDTO[]>;
  getAccount(userId: string, accountId: string): Promise<AccountDTO>;
  createAccount(userId: string, data: CreateAccountDTO): Promise<AccountDTO>;
  updateAccount(
    userId: string,
    accountId: string,
    data: UpdateAccountDTO
  ): Promise<AccountDTO>;
  deleteAccount(userId: string, accountId: string): Promise<void>;

  // Categories
  listCategories(userId: string, filters?: CategoryFilters): Promise<CategoryDTO[]>;
  getCategory(userId: string, categoryId: string): Promise<CategoryDTO>;
  createCategory(userId: string, data: CreateCategoryDTO): Promise<CategoryDTO>;
  updateCategory(
    userId: string,
    categoryId: string,
    data: UpdateCategoryDTO
  ): Promise<CategoryDTO>;
  deleteCategory(userId: string, categoryId: string): Promise<void>;

  // Transactions
  listTransactions(
    userId: string,
    filters?: TransactionFilters
  ): Promise<PaginatedTransactionsResponse>;
  getTransaction(userId: string, transactionId: string): Promise<TransactionDTO>;
  createTransaction(
    userId: string,
    data: CreateTransactionDTO,
    options?: { clientRequestId?: string }
  ): Promise<TransactionDTO>;
  updateTransaction(
    userId: string,
    transactionId: string,
    data: UpdateTransactionDTO
  ): Promise<TransactionDTO>;
  deleteTransaction(userId: string, transactionId: string): Promise<void>;

  // Valuations
  listValuations(userId: string, filters: ValuationFilters): Promise<ValuationDTO[]>;
  createValuation(userId: string, data: CreateValuationDTO): Promise<ValuationDTO>;

  // Budgets
  listBudgets(
    userId: string,
    filters?: BudgetFilters
  ): Promise<{ budgets: BudgetDTO[]; progress: BudgetProgressDTO[] }>;
  getBudget(userId: string, budgetId: string): Promise<BudgetDTO>;
  createBudget(userId: string, data: CreateBudgetDTO): Promise<BudgetDTO>;
  updateBudget(
    userId: string,
    budgetId: string,
    data: UpdateBudgetDTO
  ): Promise<BudgetDTO>;
  deleteBudget(userId: string, budgetId: string): Promise<void>;

  // Recurring Rules
  listRecurringRules(userId: string): Promise<RecurringRuleDTO[]>;
  getRecurringRule(userId: string, ruleId: string): Promise<RecurringRuleDTO>;
  createRecurringRule(
    userId: string,
    data: CreateRecurringRuleDTO
  ): Promise<RecurringRuleDTO>;
  updateRecurringRule(
    userId: string,
    ruleId: string,
    data: UpdateRecurringRuleDTO
  ): Promise<RecurringRuleDTO>;
  deleteRecurringRule(userId: string, ruleId: string): Promise<void>;

  // Stats / Dashboard
  getOverviewStats(
    userId: string,
    query?: OverviewStatsQuery
  ): Promise<OverviewStatsDTO>;
  getNetWorthHistory(
    userId: string,
    query?: NetWorthHistoryQuery
  ): Promise<NetWorthPointDTO[]>;

  // Cron automation
  processRecurringRules(): Promise<{ processed: number; generated: number }>;
  snapshotValuations(): Promise<{ snapshots: number }>;
}

export class DbFinanceService implements FinanceService {
  async listAccounts(): Promise<AccountDTO[]> {
    throw new NotImplementedError('DbFinanceService: listAccounts not implemented');
  }
  async getAccount(): Promise<AccountDTO> {
    throw new NotImplementedError('DbFinanceService: getAccount not implemented');
  }
  async createAccount(): Promise<AccountDTO> {
    throw new NotImplementedError('DbFinanceService: createAccount not implemented');
  }
  async updateAccount(): Promise<AccountDTO> {
    throw new NotImplementedError('DbFinanceService: updateAccount not implemented');
  }
  async deleteAccount(): Promise<void> {
    throw new NotImplementedError('DbFinanceService: deleteAccount not implemented');
  }

  async listCategories(): Promise<CategoryDTO[]> {
    throw new NotImplementedError('DbFinanceService: listCategories not implemented');
  }
  async getCategory(): Promise<CategoryDTO> {
    throw new NotImplementedError('DbFinanceService: getCategory not implemented');
  }
  async createCategory(): Promise<CategoryDTO> {
    throw new NotImplementedError('DbFinanceService: createCategory not implemented');
  }
  async updateCategory(): Promise<CategoryDTO> {
    throw new NotImplementedError('DbFinanceService: updateCategory not implemented');
  }
  async deleteCategory(): Promise<void> {
    throw new NotImplementedError('DbFinanceService: deleteCategory not implemented');
  }

  async listTransactions(): Promise<PaginatedTransactionsResponse> {
    throw new NotImplementedError('DbFinanceService: listTransactions not implemented');
  }
  async getTransaction(): Promise<TransactionDTO> {
    throw new NotImplementedError('DbFinanceService: getTransaction not implemented');
  }
  async createTransaction(): Promise<TransactionDTO> {
    throw new NotImplementedError('DbFinanceService: createTransaction not implemented');
  }
  async updateTransaction(): Promise<TransactionDTO> {
    throw new NotImplementedError('DbFinanceService: updateTransaction not implemented');
  }
  async deleteTransaction(): Promise<void> {
    throw new NotImplementedError('DbFinanceService: deleteTransaction not implemented');
  }

  async listValuations(): Promise<ValuationDTO[]> {
    throw new NotImplementedError('DbFinanceService: listValuations not implemented');
  }
  async createValuation(): Promise<ValuationDTO> {
    throw new NotImplementedError('DbFinanceService: createValuation not implemented');
  }

  async listBudgets(): Promise<{ budgets: BudgetDTO[]; progress: BudgetProgressDTO[] }> {
    throw new NotImplementedError('DbFinanceService: listBudgets not implemented');
  }
  async getBudget(): Promise<BudgetDTO> {
    throw new NotImplementedError('DbFinanceService: getBudget not implemented');
  }
  async createBudget(): Promise<BudgetDTO> {
    throw new NotImplementedError('DbFinanceService: createBudget not implemented');
  }
  async updateBudget(): Promise<BudgetDTO> {
    throw new NotImplementedError('DbFinanceService: updateBudget not implemented');
  }
  async deleteBudget(): Promise<void> {
    throw new NotImplementedError('DbFinanceService: deleteBudget not implemented');
  }

  async listRecurringRules(): Promise<RecurringRuleDTO[]> {
    throw new NotImplementedError('DbFinanceService: listRecurringRules not implemented');
  }
  async getRecurringRule(): Promise<RecurringRuleDTO> {
    throw new NotImplementedError('DbFinanceService: getRecurringRule not implemented');
  }
  async createRecurringRule(): Promise<RecurringRuleDTO> {
    throw new NotImplementedError('DbFinanceService: createRecurringRule not implemented');
  }
  async updateRecurringRule(): Promise<RecurringRuleDTO> {
    throw new NotImplementedError('DbFinanceService: updateRecurringRule not implemented');
  }
  async deleteRecurringRule(): Promise<void> {
    throw new NotImplementedError('DbFinanceService: deleteRecurringRule not implemented');
  }

  async getOverviewStats(): Promise<OverviewStatsDTO> {
    throw new NotImplementedError('DbFinanceService: getOverviewStats not implemented');
  }
  async getNetWorthHistory(): Promise<NetWorthPointDTO[]> {
    throw new NotImplementedError('DbFinanceService: getNetWorthHistory not implemented');
  }

  async processRecurringRules(): Promise<{ processed: number; generated: number }> {
    throw new NotImplementedError('DbFinanceService: processRecurringRules not implemented');
  }
  async snapshotValuations(): Promise<{ snapshots: number }> {
    throw new NotImplementedError('DbFinanceService: snapshotValuations not implemented');
  }
}

export class MockFinanceService implements FinanceService {
  async listAccounts(): Promise<AccountDTO[]> {
    throw new NotImplementedError('MockFinanceService: listAccounts not implemented');
  }
  async getAccount(): Promise<AccountDTO> {
    throw new NotImplementedError('MockFinanceService: getAccount not implemented');
  }
  async createAccount(): Promise<AccountDTO> {
    throw new NotImplementedError('MockFinanceService: createAccount not implemented');
  }
  async updateAccount(): Promise<AccountDTO> {
    throw new NotImplementedError('MockFinanceService: updateAccount not implemented');
  }
  async deleteAccount(): Promise<void> {
    throw new NotImplementedError('MockFinanceService: deleteAccount not implemented');
  }

  async listCategories(): Promise<CategoryDTO[]> {
    throw new NotImplementedError('MockFinanceService: listCategories not implemented');
  }
  async getCategory(): Promise<CategoryDTO> {
    throw new NotImplementedError('MockFinanceService: getCategory not implemented');
  }
  async createCategory(): Promise<CategoryDTO> {
    throw new NotImplementedError('MockFinanceService: createCategory not implemented');
  }
  async updateCategory(): Promise<CategoryDTO> {
    throw new NotImplementedError('MockFinanceService: updateCategory not implemented');
  }
  async deleteCategory(): Promise<void> {
    throw new NotImplementedError('MockFinanceService: deleteCategory not implemented');
  }

  async listTransactions(): Promise<PaginatedTransactionsResponse> {
    throw new NotImplementedError('MockFinanceService: listTransactions not implemented');
  }
  async getTransaction(): Promise<TransactionDTO> {
    throw new NotImplementedError('MockFinanceService: getTransaction not implemented');
  }
  async createTransaction(): Promise<TransactionDTO> {
    throw new NotImplementedError('MockFinanceService: createTransaction not implemented');
  }
  async updateTransaction(): Promise<TransactionDTO> {
    throw new NotImplementedError('MockFinanceService: updateTransaction not implemented');
  }
  async deleteTransaction(): Promise<void> {
    throw new NotImplementedError('MockFinanceService: deleteTransaction not implemented');
  }

  async listValuations(): Promise<ValuationDTO[]> {
    throw new NotImplementedError('MockFinanceService: listValuations not implemented');
  }
  async createValuation(): Promise<ValuationDTO> {
    throw new NotImplementedError('MockFinanceService: createValuation not implemented');
  }

  async listBudgets(): Promise<{ budgets: BudgetDTO[]; progress: BudgetProgressDTO[] }> {
    throw new NotImplementedError('MockFinanceService: listBudgets not implemented');
  }
  async getBudget(): Promise<BudgetDTO> {
    throw new NotImplementedError('MockFinanceService: getBudget not implemented');
  }
  async createBudget(): Promise<BudgetDTO> {
    throw new NotImplementedError('MockFinanceService: createBudget not implemented');
  }
  async updateBudget(): Promise<BudgetDTO> {
    throw new NotImplementedError('MockFinanceService: updateBudget not implemented');
  }
  async deleteBudget(): Promise<void> {
    throw new NotImplementedError('MockFinanceService: deleteBudget not implemented');
  }

  async listRecurringRules(): Promise<RecurringRuleDTO[]> {
    throw new NotImplementedError('MockFinanceService: listRecurringRules not implemented');
  }
  async getRecurringRule(): Promise<RecurringRuleDTO> {
    throw new NotImplementedError('MockFinanceService: getRecurringRule not implemented');
  }
  async createRecurringRule(): Promise<RecurringRuleDTO> {
    throw new NotImplementedError('MockFinanceService: createRecurringRule not implemented');
  }
  async updateRecurringRule(): Promise<RecurringRuleDTO> {
    throw new NotImplementedError('MockFinanceService: updateRecurringRule not implemented');
  }
  async deleteRecurringRule(): Promise<void> {
    throw new NotImplementedError('MockFinanceService: deleteRecurringRule not implemented');
  }

  async getOverviewStats(): Promise<OverviewStatsDTO> {
    throw new NotImplementedError('MockFinanceService: getOverviewStats not implemented');
  }
  async getNetWorthHistory(): Promise<NetWorthPointDTO[]> {
    throw new NotImplementedError('MockFinanceService: getNetWorthHistory not implemented');
  }

  async processRecurringRules(): Promise<{ processed: number; generated: number }> {
    throw new NotImplementedError('MockFinanceService: processRecurringRules not implemented');
  }
  async snapshotValuations(): Promise<{ snapshots: number }> {
    throw new NotImplementedError('MockFinanceService: snapshotValuations not implemented');
  }
}

export { getFinanceService } from './get-service';

