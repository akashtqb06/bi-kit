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
import { type FinanceService } from '../service';
import {
  createAccountSchema,
  createBudgetSchema,
  createCategorySchema,
  createRecurringRuleSchema,
  createTransactionSchema,
  createValuationSchema,
  updateAccountSchema,
  updateBudgetSchema,
  updateCategorySchema,
  updateRecurringRuleSchema,
  updateTransactionSchema,
} from '../contract';
import { generateFinanceData, type PersonaName } from '../testdata/generator';
import { NotFoundError, BadRequestError } from '@src/app/api/utils';

export class MockFinanceService implements FinanceService {
  private accounts = new Map<string, AccountDTO>();
  private categories = new Map<string, CategoryDTO>();
  private transactions = new Map<string, TransactionDTO>();
  private valuations = new Map<string, ValuationDTO>();
  private budgets = new Map<string, BudgetDTO>();
  private recurringRules = new Map<string, RecurringRuleDTO>();
  private clientRequestCache = new Map<string, string>(); // clientRequestId -> transactionId
  private persona: PersonaName;
  private anchorDate: string;
  private seed: number | string | undefined;

  constructor(persona?: PersonaName, anchorDate = '2026-10-31', seed?: number | string) {
    this.persona = persona || (process.env.FINANCE_MOCK_PERSONA as PersonaName) || 'salaried-urban';
    this.anchorDate = anchorDate;
    this.seed = seed;
    this.reset();
  }

  /**
   * Resets and re-seeds the in-memory dataset from the generator.
   */
  reset(persona?: PersonaName): void {
    if (persona) {
      this.persona = persona;
    }
    this.accounts.clear();
    this.categories.clear();
    this.transactions.clear();
    this.valuations.clear();
    this.budgets.clear();
    this.recurringRules.clear();
    this.clientRequestCache.clear();

    const data = generateFinanceData({
      persona: this.persona,
      seed: this.seed ?? `${this.persona}_seed_v1`,
      anchorDate: this.anchorDate,
      months: 24,
    });

    for (const a of data.accounts) this.accounts.set(a.id, { ...a });
    for (const c of data.categories) this.categories.set(c.id, { ...c });
    for (const t of data.transactions) {
      this.transactions.set(t.id, { ...t });
      if (t.clientRequestId) {
        this.clientRequestCache.set(`${t.userId}:${t.clientRequestId}`, t.id);
      }
    }
    for (const v of data.valuations) this.valuations.set(v.id, { ...v });
    for (const b of data.budgets) this.budgets.set(b.id, { ...b });
    for (const r of data.recurringRules) this.recurringRules.set(r.id, { ...r });
  }

  // ============================================================================
  // Accounts
  // ============================================================================

  async listAccounts(userId: string, filters?: AccountFilters): Promise<AccountDTO[]> {
    return Array.from(this.accounts.values()).filter((a) => {
      // In mock service, we allow all accounts or filter by userId
      if (filters?.class && a.class !== filters.class) return false;
      if (filters?.kind && a.kind !== filters.kind) return false;
      if (filters?.isActive !== undefined && a.isActive !== filters.isActive) return false;
      return true;
    });
  }

  async getAccount(userId: string, accountId: string): Promise<AccountDTO> {
    const acc = this.accounts.get(accountId);
    if (!acc) throw new NotFoundError(`Account not found: ${accountId}`);
    return acc;
  }

  async createAccount(userId: string, data: CreateAccountDTO): Promise<AccountDTO> {
    const validated = createAccountSchema.parse(data);
    const id = `acc_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const accountClass = ['credit_card', 'loan', 'other_liability'].includes(validated.kind)
      ? 'liability'
      : 'asset';

    const newAcc: AccountDTO = {
      id,
      userId,
      name: validated.name,
      kind: validated.kind,
      class: accountClass,
      currency: validated.currency || 'INR',
      creditLimit: validated.creditLimit ?? null,
      isActive: true,
      metadata: validated.metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    this.accounts.set(id, newAcc);
    return newAcc;
  }

  async updateAccount(
    userId: string,
    accountId: string,
    data: UpdateAccountDTO
  ): Promise<AccountDTO> {
    const acc = await this.getAccount(userId, accountId);
    const validated = updateAccountSchema.parse(data);

    const updated: AccountDTO = {
      ...acc,
      name: validated.name ?? acc.name,
      currency: validated.currency ?? acc.currency,
      creditLimit: validated.creditLimit !== undefined ? validated.creditLimit : acc.creditLimit,
      isActive: validated.isActive !== undefined ? validated.isActive : acc.isActive,
      metadata: validated.metadata ? { ...acc.metadata, ...validated.metadata } : acc.metadata,
      updatedAt: new Date().toISOString(),
    };

    this.accounts.set(accountId, updated);
    return updated;
  }

  async deleteAccount(userId: string, accountId: string): Promise<void> {
    const acc = await this.getAccount(userId, accountId);
    // Soft deactivate
    acc.isActive = false;
    acc.updatedAt = new Date().toISOString();
  }

  // ============================================================================
  // Categories
  // ============================================================================

  async listCategories(userId: string, filters?: CategoryFilters): Promise<CategoryDTO[]> {
    return Array.from(this.categories.values()).filter((c) => {
      if (filters?.type && c.type !== filters.type) return false;
      return true;
    });
  }

  async getCategory(userId: string, categoryId: string): Promise<CategoryDTO> {
    const cat = this.categories.get(categoryId);
    if (!cat) throw new NotFoundError(`Category not found: ${categoryId}`);
    return cat;
  }

  async createCategory(userId: string, data: CreateCategoryDTO): Promise<CategoryDTO> {
    const validated = createCategorySchema.parse(data);
    const id = `cat_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const newCat: CategoryDTO = {
      id,
      userId,
      name: validated.name,
      type: validated.type,
      parentId: validated.parentId || null,
      icon: validated.icon || null,
      color: validated.color || null,
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    };

    this.categories.set(id, newCat);
    return newCat;
  }

  async updateCategory(
    userId: string,
    categoryId: string,
    data: UpdateCategoryDTO
  ): Promise<CategoryDTO> {
    const cat = await this.getCategory(userId, categoryId);
    const validated = updateCategorySchema.parse(data);

    const updated: CategoryDTO = {
      ...cat,
      name: validated.name ?? cat.name,
      parentId: validated.parentId !== undefined ? validated.parentId : cat.parentId,
      icon: validated.icon !== undefined ? validated.icon : cat.icon,
      color: validated.color !== undefined ? validated.color : cat.color,
      updatedAt: new Date().toISOString(),
    };

    this.categories.set(categoryId, updated);
    return updated;
  }

  async deleteCategory(userId: string, categoryId: string): Promise<void> {
    await this.getCategory(userId, categoryId);
    this.categories.delete(categoryId);
  }

  // ============================================================================
  // Transactions
  // ============================================================================

  async listTransactions(
    userId: string,
    filters?: TransactionFilters
  ): Promise<PaginatedTransactionsResponse> {
    let list = Array.from(this.transactions.values()).filter((t) => !t.deletedAt);

    if (filters?.accountId) {
      list = list.filter((t) => t.accountId === filters.accountId || t.toAccountId === filters.accountId);
    }
    if (filters?.categoryId) {
      list = list.filter((t) => t.categoryId === filters.categoryId);
    }
    if (filters?.type) {
      list = list.filter((t) => t.type === filters.type);
    }
    if (filters?.startDate) {
      list = list.filter((t) => t.date >= filters.startDate!);
    }
    if (filters?.endDate) {
      list = list.filter((t) => t.date <= filters.endDate!);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      list = list.filter((t) => (t.payee && t.payee.toLowerCase().includes(q)) || (t.note && t.note.toLowerCase().includes(q)));
    }

    // Sort descending by date DESC, id DESC
    list.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.id.localeCompare(a.id);
    });

    // Cursor pagination (base64 encoded "date:id")
    if (filters?.cursor) {
      try {
        const decoded = Buffer.from(filters.cursor, 'base64').toString('utf8');
        const [cursorDate, cursorId] = decoded.split(':');
        const cursorIdx = list.findIndex((t) => t.date < cursorDate || (t.date === cursorDate && t.id < cursorId));
        if (cursorIdx >= 0) {
          list = list.slice(cursorIdx);
        } else {
          list = [];
        }
      } catch {
        // Invalid cursor ignored
      }
    }

    const limit = filters?.limit ?? 50;
    const hasMore = list.length > limit;
    const pageItems = list.slice(0, limit);

    let nextCursor: string | null = null;
    if (hasMore && pageItems.length > 0) {
      const last = pageItems[pageItems.length - 1];
      nextCursor = Buffer.from(`${last.date}:${last.id}`).toString('base64');
    }

    return {
      transactions: pageItems,
      nextCursor,
      hasMore,
    };
  }

  async getTransaction(userId: string, transactionId: string): Promise<TransactionDTO> {
    const txn = this.transactions.get(transactionId);
    if (!txn || txn.deletedAt) throw new NotFoundError(`Transaction not found: ${transactionId}`);
    return txn;
  }

  async createTransaction(
    userId: string,
    data: CreateTransactionDTO,
    options?: { clientRequestId?: string }
  ): Promise<TransactionDTO> {
    const validated = createTransactionSchema.parse(data);
    const clientReqId = options?.clientRequestId || validated.clientRequestId;

    // Idempotency check
    if (clientReqId) {
      const cacheKey = `${userId}:${clientReqId}`;
      const existingId = this.clientRequestCache.get(cacheKey);
      if (existingId && this.transactions.has(existingId)) {
        return this.transactions.get(existingId)!;
      }
    }

    // Validate account exists
    if (!this.accounts.has(validated.accountId)) {
      throw new BadRequestError(`Source account does not exist: ${validated.accountId}`);
    }
    if (validated.toAccountId && !this.accounts.has(validated.toAccountId)) {
      throw new BadRequestError(`Target account does not exist: ${validated.toAccountId}`);
    }

    const id = `txn_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    let signedAmount = validated.amount;
    if (validated.type === 'expense' || validated.type === 'transfer') {
      signedAmount = -validated.amount;
    }

    const newTxn: TransactionDTO = {
      id,
      userId,
      accountId: validated.accountId,
      toAccountId: validated.toAccountId || null,
      categoryId: validated.categoryId || null,
      date: validated.date,
      type: validated.type,
      amount: validated.amount,
      signedAmount,
      payee: validated.payee || null,
      note: validated.note || null,
      tags: validated.tags || null,
      clientRequestId: clientReqId || null,
      importHash: null,
      isRecurring: validated.isRecurring || false,
      recurringRuleId: validated.recurringRuleId || null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.transactions.set(id, newTxn);
    if (clientReqId) {
      this.clientRequestCache.set(`${userId}:${clientReqId}`, id);
    }

    return newTxn;
  }

  async updateTransaction(
    userId: string,
    transactionId: string,
    data: UpdateTransactionDTO
  ): Promise<TransactionDTO> {
    const txn = await this.getTransaction(userId, transactionId);
    const validated = updateTransactionSchema.parse(data);

    const amount = validated.amount !== undefined ? validated.amount : txn.amount;
    const type = validated.type || txn.type;
    let signedAmount = amount;
    if (type === 'expense' || type === 'transfer') {
      signedAmount = -amount;
    }

    const updated: TransactionDTO = {
      ...txn,
      accountId: validated.accountId ?? txn.accountId,
      toAccountId: validated.toAccountId !== undefined ? validated.toAccountId : txn.toAccountId,
      categoryId: validated.categoryId !== undefined ? validated.categoryId : txn.categoryId,
      date: validated.date ?? txn.date,
      type,
      amount,
      signedAmount,
      payee: validated.payee !== undefined ? validated.payee : txn.payee,
      note: validated.note !== undefined ? validated.note : txn.note,
      tags: validated.tags !== undefined ? validated.tags : txn.tags,
      updatedAt: new Date().toISOString(),
    };

    this.transactions.set(transactionId, updated);
    return updated;
  }

  async deleteTransaction(userId: string, transactionId: string): Promise<void> {
    const txn = await this.getTransaction(userId, transactionId);
    txn.deletedAt = new Date().toISOString();
    txn.updatedAt = new Date().toISOString();
  }

  // ============================================================================
  // Valuations
  // ============================================================================

  async listValuations(userId: string, filters: ValuationFilters): Promise<ValuationDTO[]> {
    let list = Array.from(this.valuations.values()).filter((v) => v.accountId === filters.accountId);
    if (filters.startDate) list = list.filter((v) => v.date >= filters.startDate!);
    if (filters.endDate) list = list.filter((v) => v.date <= filters.endDate!);
    list.sort((a, b) => b.date.localeCompare(a.date));
    return list;
  }

  async createValuation(userId: string, data: CreateValuationDTO): Promise<ValuationDTO> {
    const validated = createValuationSchema.parse(data);
    const id = `val_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const newVal: ValuationDTO = {
      id,
      accountId: validated.accountId,
      date: validated.date,
      value: validated.value,
      costBasis: validated.costBasis || null,
      note: validated.note || null,
      createdAt: now,
      updatedAt: now,
    };

    this.valuations.set(id, newVal);
    return newVal;
  }

  // ============================================================================
  // Budgets
  // ============================================================================

  async listBudgets(
    userId: string,
    filters?: BudgetFilters
  ): Promise<{ budgets: BudgetDTO[]; progress: BudgetProgressDTO[] }> {
    let list = Array.from(this.budgets.values());
    if (filters?.period) list = list.filter((b) => b.period === filters.period);

    // Compute progress for each budget
    const activeTxns = Array.from(this.transactions.values()).filter((t) => !t.deletedAt && t.type === 'expense');

    const progress: BudgetProgressDTO[] = list.map((b) => {
      const cat = this.categories.get(b.categoryId);
      const categoryName = cat ? cat.name : 'Unknown';

      // Current month spend for this category
      const currentMonth = this.anchorDate.slice(0, 7);
      const spentAmount = activeTxns
        .filter((t) => t.categoryId === b.categoryId && t.date.startsWith(currentMonth))
        .reduce((sum, t) => sum + t.amount, 0);

      const budgetedAmount = b.amount;
      const remainingAmount = Math.max(0, budgetedAmount - spentAmount);
      const percentageUsed = budgetedAmount > 0 ? Math.round((spentAmount / budgetedAmount) * 10000) / 100 : 0;

      return {
        budgetId: b.id,
        categoryId: b.categoryId,
        categoryName,
        period: b.period,
        budgetedAmount,
        spentAmount,
        remainingAmount,
        percentageUsed,
      };
    });

    return { budgets: list, progress };
  }

  async getBudget(userId: string, budgetId: string): Promise<BudgetDTO> {
    const b = this.budgets.get(budgetId);
    if (!b) throw new NotFoundError(`Budget not found: ${budgetId}`);
    return b;
  }

  async createBudget(userId: string, data: CreateBudgetDTO): Promise<BudgetDTO> {
    const validated = createBudgetSchema.parse(data);
    const id = `bgt_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const newBudget: BudgetDTO = {
      id,
      userId,
      categoryId: validated.categoryId,
      amount: validated.amount,
      period: validated.period,
      startDate: validated.startDate,
      endDate: validated.endDate || null,
      createdAt: now,
      updatedAt: now,
    };

    this.budgets.set(id, newBudget);
    return newBudget;
  }

  async updateBudget(userId: string, budgetId: string, data: UpdateBudgetDTO): Promise<BudgetDTO> {
    const b = await this.getBudget(userId, budgetId);
    const validated = updateBudgetSchema.parse(data);

    const updated: BudgetDTO = {
      ...b,
      amount: validated.amount !== undefined ? validated.amount : b.amount,
      period: validated.period ?? b.period,
      startDate: validated.startDate ?? b.startDate,
      endDate: validated.endDate !== undefined ? validated.endDate : b.endDate,
      updatedAt: new Date().toISOString(),
    };

    this.budgets.set(budgetId, updated);
    return updated;
  }

  async deleteBudget(userId: string, budgetId: string): Promise<void> {
    await this.getBudget(userId, budgetId);
    this.budgets.delete(budgetId);
  }

  // ============================================================================
  // Recurring Rules
  // ============================================================================

  async listRecurringRules(_userId: string): Promise<RecurringRuleDTO[]> {
    return Array.from(this.recurringRules.values());
  }

  async getRecurringRule(_userId: string, ruleId: string): Promise<RecurringRuleDTO> {
    const r = this.recurringRules.get(ruleId);
    if (!r) throw new NotFoundError(`Recurring rule not found: ${ruleId}`);
    return r;
  }

  async createRecurringRule(userId: string, data: CreateRecurringRuleDTO): Promise<RecurringRuleDTO> {
    const validated = createRecurringRuleSchema.parse(data);
    const id = `rec_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const newRule: RecurringRuleDTO = {
      id,
      userId,
      accountId: validated.accountId,
      toAccountId: validated.toAccountId || null,
      categoryId: validated.categoryId || null,
      type: validated.type,
      amount: validated.amount,
      payee: validated.payee || null,
      note: validated.note || null,
      frequency: validated.frequency,
      interval: validated.interval || 1,
      startDate: validated.startDate,
      endDate: validated.endDate || null,
      nextOccurrence: validated.nextOccurrence || validated.startDate,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    this.recurringRules.set(id, newRule);
    return newRule;
  }

  async updateRecurringRule(
    userId: string,
    ruleId: string,
    data: UpdateRecurringRuleDTO
  ): Promise<RecurringRuleDTO> {
    const r = await this.getRecurringRule(userId, ruleId);
    const validated = updateRecurringRuleSchema.parse(data);

    const updated: RecurringRuleDTO = {
      ...r,
      accountId: validated.accountId ?? r.accountId,
      toAccountId: validated.toAccountId !== undefined ? validated.toAccountId : r.toAccountId,
      categoryId: validated.categoryId !== undefined ? validated.categoryId : r.categoryId,
      amount: validated.amount !== undefined ? validated.amount : r.amount,
      payee: validated.payee !== undefined ? validated.payee : r.payee,
      note: validated.note !== undefined ? validated.note : r.note,
      frequency: validated.frequency ?? r.frequency,
      interval: validated.interval ?? r.interval,
      startDate: validated.startDate ?? r.startDate,
      endDate: validated.endDate !== undefined ? validated.endDate : r.endDate,
      nextOccurrence: validated.nextOccurrence ?? r.nextOccurrence,
      isActive: validated.isActive !== undefined ? validated.isActive : r.isActive,
      updatedAt: new Date().toISOString(),
    };

    this.recurringRules.set(ruleId, updated);
    return updated;
  }

  async deleteRecurringRule(userId: string, ruleId: string): Promise<void> {
    await this.getRecurringRule(userId, ruleId);
    this.recurringRules.delete(ruleId);
  }

  // ============================================================================
  // Stats & Overview
  // ============================================================================

  async getOverviewStats(_userId: string): Promise<OverviewStatsDTO> {
    const activeTxns = Array.from(this.transactions.values()).filter(
      (t) => !t.deletedAt && t.date <= this.anchorDate
    );

    // Compute ledger balances
    const balances = new Map<string, number>();
    for (const a of this.accounts.values()) balances.set(a.id, 0);

    for (const t of activeTxns) {
      if (t.type === 'expense') {
        balances.set(t.accountId, (balances.get(t.accountId) || 0) - t.amount);
      } else if (t.type === 'income') {
        balances.set(t.accountId, (balances.get(t.accountId) || 0) + t.amount);
      } else if (t.type === 'transfer') {
        balances.set(t.accountId, (balances.get(t.accountId) || 0) - t.amount);
        if (t.toAccountId) {
          balances.set(t.toAccountId, (balances.get(t.toAccountId) || 0) + t.amount);
        }
      } else if (t.type === 'adjustment') {
        balances.set(t.accountId, (balances.get(t.accountId) || 0) + t.signedAmount);
      }
    }

    let totalAssets = 0;
    let totalLiabilities = 0;

    for (const acc of this.accounts.values()) {
      if (!acc.isActive && this.anchorDate >= '2026-01-01') continue;

      if (acc.class === 'asset') {
        if (acc.kind === 'mutual_fund' || acc.kind === 'stocks') {
          const matchingValuations = Array.from(this.valuations.values())
            .filter((v) => v.accountId === acc.id && v.date <= this.anchorDate)
            .sort((a, b) => b.date.localeCompare(a.date));
          if (matchingValuations.length > 0) {
            totalAssets += matchingValuations[0].value;
          } else {
            totalAssets += Math.max(0, balances.get(acc.id) || 0);
          }
        } else {
          totalAssets += Math.max(0, balances.get(acc.id) || 0);
        }
      } else if (acc.class === 'liability') {
        if (acc.kind === 'credit_card') {
          totalLiabilities += Math.max(0, -(balances.get(acc.id) || 0));
        } else if (acc.kind === 'loan') {
          totalLiabilities += Math.max(0, balances.get(acc.id) || 0);
        }
      }
    }

    const netWorth = totalAssets - totalLiabilities;

    // Monthly income & expense for the current anchor month
    const currentMonth = this.anchorDate.slice(0, 7);
    const monthTxns = activeTxns.filter((t) => t.date.startsWith(currentMonth));
    const monthlyIncome = monthTxns.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const monthlyExpense = monthTxns.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const savingsRate = monthlyIncome > 0 ? Math.max(0, (monthlyIncome - monthlyExpense) / monthlyIncome) : 0;

    return {
      netWorth,
      totalAssets,
      totalLiabilities,
      monthlyIncome,
      monthlyExpense,
      savingsRate: Math.round(savingsRate * 10000) / 10000,
    };
  }

  async getNetWorthHistory(
    userId: string,
    query?: NetWorthHistoryQuery
  ): Promise<NetWorthPointDTO[]> {
    const activeTxns = Array.from(this.transactions.values()).filter(
      (t) => !t.deletedAt && t.date <= this.anchorDate
    );

    const startDate = query?.startDate || '2024-01-01';
    const endDate = query?.endDate || this.anchorDate;
    const interval = query?.interval || 'daily';

    if (interval === 'monthly') {
      const monthMap = new Set<string>();
      for (const t of activeTxns) {
        if (t.date >= startDate && t.date <= endDate) {
          monthMap.add(t.date.slice(0, 7));
        }
      }
      const sortedMonths = Array.from(monthMap).sort();

      return sortedMonths.map((mStr) => {
        const [yStr, monStr] = mStr.split('-');
        const year = parseInt(yStr, 10);
        const month = parseInt(monStr, 10);
        const lastDayNum = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const monthEndDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

        const balances = new Map<string, number>();
        for (const a of this.accounts.values()) balances.set(a.id, 0);

        for (const t of activeTxns) {
          if (t.date <= monthEndDate) {
            if (t.type === 'expense') {
              balances.set(t.accountId, (balances.get(t.accountId) || 0) - t.amount);
            } else if (t.type === 'income') {
              balances.set(t.accountId, (balances.get(t.accountId) || 0) + t.amount);
            } else if (t.type === 'transfer') {
              balances.set(t.accountId, (balances.get(t.accountId) || 0) - t.amount);
              if (t.toAccountId) {
                balances.set(t.toAccountId, (balances.get(t.toAccountId) || 0) + t.amount);
              }
            } else if (t.type === 'adjustment') {
              balances.set(t.accountId, (balances.get(t.accountId) || 0) + t.signedAmount);
            }
          }
        }

        let assets = 0;
        let liabilities = 0;

        for (const acc of this.accounts.values()) {
          if (!acc.isActive && monthEndDate >= '2026-01-01') continue;

          if (acc.class === 'asset') {
            if (acc.kind === 'mutual_fund' || acc.kind === 'stocks') {
              const matchingValuations = Array.from(this.valuations.values())
                .filter((v) => v.accountId === acc.id && v.date <= monthEndDate)
                .sort((a, b) => b.date.localeCompare(a.date));
              if (matchingValuations.length > 0) {
                assets += matchingValuations[0].value;
              } else {
                assets += Math.max(0, balances.get(acc.id) || 0);
              }
            } else {
              assets += Math.max(0, balances.get(acc.id) || 0);
            }
          } else if (acc.class === 'liability') {
            if (acc.kind === 'credit_card') {
              liabilities += Math.max(0, -(balances.get(acc.id) || 0));
            } else if (acc.kind === 'loan') {
              liabilities += Math.max(0, balances.get(acc.id) || 0);
            }
          }
        }

        return {
          date: monthEndDate,
          assets,
          liabilities,
          netWorth: assets - liabilities,
        };
      });
    }

    // Daily
    const dates = new Set<string>();
    for (const t of activeTxns) {
      if (t.date >= startDate && t.date <= endDate) {
        dates.add(t.date);
      }
    }
    const sortedDates = Array.from(dates).sort();

    return sortedDates.map((dKey) => {
      const balances = new Map<string, number>();
      for (const a of this.accounts.values()) balances.set(a.id, 0);

      for (const t of activeTxns) {
        if (t.date <= dKey) {
          if (t.type === 'expense') {
            balances.set(t.accountId, (balances.get(t.accountId) || 0) - t.amount);
          } else if (t.type === 'income') {
            balances.set(t.accountId, (balances.get(t.accountId) || 0) + t.amount);
          } else if (t.type === 'transfer') {
            balances.set(t.accountId, (balances.get(t.accountId) || 0) - t.amount);
            if (t.toAccountId) {
              balances.set(t.toAccountId, (balances.get(t.toAccountId) || 0) + t.amount);
            }
          } else if (t.type === 'adjustment') {
            balances.set(t.accountId, (balances.get(t.accountId) || 0) + t.signedAmount);
          }
        }
      }

      let assets = 0;
      let liabilities = 0;

      for (const acc of this.accounts.values()) {
        if (!acc.isActive && dKey >= '2026-01-01') continue;
        if (acc.class === 'asset') {
          if (acc.kind === 'mutual_fund' || acc.kind === 'stocks') {
            const matchingValuations = Array.from(this.valuations.values())
              .filter((v) => v.accountId === acc.id && v.date <= dKey)
              .sort((a, b) => b.date.localeCompare(a.date));
            if (matchingValuations.length > 0) {
              assets += matchingValuations[0].value;
            } else {
              assets += Math.max(0, balances.get(acc.id) || 0);
            }
          } else {
            assets += Math.max(0, balances.get(acc.id) || 0);
          }
        } else if (acc.class === 'liability') {
          if (acc.kind === 'credit_card') {
            liabilities += Math.max(0, -(balances.get(acc.id) || 0));
          } else if (acc.kind === 'loan') {
            liabilities += Math.max(0, balances.get(acc.id) || 0);
          }
        }
      }

      return {
        date: dKey,
        assets,
        liabilities,
        netWorth: assets - liabilities,
      };
    });
  }

  // ============================================================================
  // Cron
  // ============================================================================

  async processRecurringRules(): Promise<{ processed: number; generated: number }> {
    let generated = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const rule of this.recurringRules.values()) {
      if (rule.isActive && rule.nextOccurrence <= today) {
        await this.createTransaction(rule.userId, {
          accountId: rule.accountId,
          toAccountId: rule.toAccountId,
          categoryId: rule.categoryId,
          date: rule.nextOccurrence,
          type: rule.type,
          amount: rule.amount,
          payee: rule.payee,
          note: rule.note,
          isRecurring: true,
          recurringRuleId: rule.id,
        });
        generated++;

        // Advance next occurrence by 1 month
        const nextD = new Date(rule.nextOccurrence);
        nextD.setMonth(nextD.getMonth() + rule.interval);
        rule.nextOccurrence = nextD.toISOString().slice(0, 10);
      }
    }

    return { processed: this.recurringRules.size, generated };
  }

  async snapshotValuations(): Promise<{ snapshots: number }> {
    return { snapshots: this.valuations.size };
  }
}

