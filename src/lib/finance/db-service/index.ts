import type { FinanceService } from '../service';
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
} from '../contract';

import * as accounts from './accounts';
import * as categories from './categories';
import * as transactions from './transactions';
import * as valuations from './valuations';
import * as budgets from './budgets';
import * as recurring from './recurring';
import * as stats from './stats';
import * as history from './history';

export class DbFinanceService implements FinanceService {
  // ============================================================================
  // Accounts
  // ============================================================================
  async listAccounts(userId: string, filters?: AccountFilters): Promise<AccountDTO[]> {
    return accounts.listAccounts(userId, filters);
  }

  async getAccount(userId: string, accountId: string): Promise<AccountDTO> {
    return accounts.getAccount(userId, accountId);
  }

  async createAccount(userId: string, data: CreateAccountDTO): Promise<AccountDTO> {
    const acc = await accounts.createAccount(userId, data);
    if (acc.kind === 'fixed_deposit' || acc.kind === 'recurring_deposit') {
      try {
        await valuations.recomputeDepositValuations(userId, acc.id);
      } catch (err) {
        console.warn(`[DbFinanceService] recomputeDepositValuations failed for ${acc.id}:`, err);
      }
    }
    return acc;
  }

  async updateAccount(
    userId: string,
    accountId: string,
    data: UpdateAccountDTO
  ): Promise<AccountDTO> {
    const acc = await accounts.updateAccount(userId, accountId, data);
    if (acc.kind === 'fixed_deposit' || acc.kind === 'recurring_deposit') {
      try {
        await valuations.recomputeDepositValuations(userId, acc.id);
      } catch (err) {
        console.warn(`[DbFinanceService] recomputeDepositValuations failed for ${acc.id}:`, err);
      }
    }
    return acc;
  }

  async deleteAccount(userId: string, accountId: string): Promise<void> {
    return accounts.deleteAccount(userId, accountId);
  }

  // ============================================================================
  // Categories
  // ============================================================================
  async listCategories(userId: string, filters?: CategoryFilters): Promise<CategoryDTO[]> {
    return categories.listCategories(userId, filters);
  }

  async getCategory(userId: string, categoryId: string): Promise<CategoryDTO> {
    return categories.getCategory(userId, categoryId);
  }

  async createCategory(userId: string, data: CreateCategoryDTO): Promise<CategoryDTO> {
    return categories.createCategory(userId, data);
  }

  async updateCategory(
    userId: string,
    categoryId: string,
    data: UpdateCategoryDTO
  ): Promise<CategoryDTO> {
    return categories.updateCategory(userId, categoryId, data);
  }

  async deleteCategory(userId: string, categoryId: string): Promise<void> {
    return categories.deleteCategory(userId, categoryId);
  }

  // ============================================================================
  // Transactions
  // ============================================================================
  async listTransactions(
    userId: string,
    filters?: TransactionFilters
  ): Promise<PaginatedTransactionsResponse> {
    return transactions.listTransactions(userId, filters);
  }

  async getTransaction(userId: string, transactionId: string): Promise<TransactionDTO> {
    return transactions.getTransaction(userId, transactionId);
  }

  async createTransaction(
    userId: string,
    data: CreateTransactionDTO,
    options?: { clientRequestId?: string }
  ): Promise<TransactionDTO> {
    return transactions.createTransaction(userId, data, options);
  }

  async updateTransaction(
    userId: string,
    transactionId: string,
    data: UpdateTransactionDTO
  ): Promise<TransactionDTO> {
    return transactions.updateTransaction(userId, transactionId, data);
  }

  async deleteTransaction(userId: string, transactionId: string): Promise<void> {
    return transactions.deleteTransaction(userId, transactionId);
  }

  async bulkUpdateTransactions(
    userId: string,
    transactionIds: string[],
    data: UpdateTransactionDTO
  ): Promise<number> {
    return transactions.bulkUpdateTransactions(userId, transactionIds, data);
  }

  async bulkDeleteTransactions(
    userId: string,
    transactionIds: string[]
  ): Promise<number> {
    return transactions.bulkDeleteTransactions(userId, transactionIds);
  }

  // ============================================================================
  // Valuations
  // ============================================================================
  async listValuations(userId: string, filters: ValuationFilters): Promise<ValuationDTO[]> {
    return valuations.listValuations(userId, filters);
  }

  async createValuation(userId: string, data: CreateValuationDTO): Promise<ValuationDTO> {
    return valuations.createValuation(userId, data);
  }

  async recomputeDepositValuations(
    userId: string,
    targetAccountId?: string
  ): Promise<{ processedAccounts: number; valuationsWritten: number }> {
    return valuations.recomputeDepositValuations(userId, targetAccountId);
  }

  // ============================================================================
  // Budgets
  // ============================================================================
  async listBudgets(
    userId: string,
    filters?: BudgetFilters
  ): Promise<{ budgets: BudgetDTO[]; progress: BudgetProgressDTO[] }> {
    return budgets.listBudgets(userId, filters);
  }

  async getBudget(userId: string, budgetId: string): Promise<BudgetDTO> {
    return budgets.getBudget(userId, budgetId);
  }

  async createBudget(userId: string, data: CreateBudgetDTO): Promise<BudgetDTO> {
    return budgets.createBudget(userId, data);
  }

  async updateBudget(
    userId: string,
    budgetId: string,
    data: UpdateBudgetDTO
  ): Promise<BudgetDTO> {
    return budgets.updateBudget(userId, budgetId, data);
  }

  async deleteBudget(userId: string, budgetId: string): Promise<void> {
    return budgets.deleteBudget(userId, budgetId);
  }

  // ============================================================================
  // Recurring Rules
  // ============================================================================
  async listRecurringRules(userId: string): Promise<RecurringRuleDTO[]> {
    return recurring.listRecurringRules(userId);
  }

  async getRecurringRule(userId: string, ruleId: string): Promise<RecurringRuleDTO> {
    return recurring.getRecurringRule(userId, ruleId);
  }

  async createRecurringRule(
    userId: string,
    data: CreateRecurringRuleDTO
  ): Promise<RecurringRuleDTO> {
    return recurring.createRecurringRule(userId, data);
  }

  async updateRecurringRule(
    userId: string,
    ruleId: string,
    data: UpdateRecurringRuleDTO
  ): Promise<RecurringRuleDTO> {
    return recurring.updateRecurringRule(userId, ruleId, data);
  }

  async deleteRecurringRule(userId: string, ruleId: string): Promise<void> {
    return recurring.deleteRecurringRule(userId, ruleId);
  }

  // ============================================================================
  // Stats / Dashboard & History
  // ============================================================================
  async getOverviewStats(userId: string): Promise<OverviewStatsDTO> {
    return stats.getOverviewStats(userId);
  }

  async getNetWorthHistory(
    userId: string,
    query?: NetWorthHistoryQuery
  ): Promise<NetWorthPointDTO[]> {
    return history.getNetWorthHistory(userId, query);
  }

  // ============================================================================
  // Cron Automation
  // ============================================================================
  async processRecurringRules(): Promise<{ processed: number; generated: number }> {
    return recurring.processRecurringRules();
  }

  async snapshotValuations(): Promise<{ snapshots: number }> {
    return valuations.snapshotValuations();
  }
}


export {
  accounts,
  categories,
  transactions,
  valuations,
  budgets,
  recurring,
  stats,
  history,
};
