'use client';

import { create } from 'zustand';
import type {
  BudgetDTO,
  BudgetFilters,
  BudgetProgressDTO,
  CategoryDTO,
  CreateAccountDTO,
  CreateBudgetDTO,
  CreateCategoryDTO,
  CreateTransactionDTO,
  CreateValuationDTO,
  NetWorthPointDTO,
  OverviewStatsDTO,
  TransactionDTO,
  UpdateAccountDTO,
  UpdateBudgetDTO,
  UpdateCategoryDTO,
  UpdateTransactionDTO,
  ValuationDTO,
} from '@src/lib/finance/contract';
import type { AccountWithBalance } from './fixtures';

export type { AccountWithBalance };

export type SliceStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface FinanceState {
  userId: string | null;
  isInitialized: boolean;
  accountsStatus: SliceStatus;
  categoriesStatus: SliceStatus;
  transactionsStatus: SliceStatus;
  overviewStatus: SliceStatus;
  historyStatus: SliceStatus;
  budgetsStatus: SliceStatus;

  accounts: AccountWithBalance[];
  categories: CategoryDTO[];
  transactions: TransactionDTO[];
  budgets: BudgetDTO[];
  budgetProgress: BudgetProgressDTO[];
  valuations: Record<string, ValuationDTO[]>;
  netWorthHistory: NetWorthPointDTO[];
  overviewStats: OverviewStatsDTO | null;
  overviewCache: Record<string, OverviewStatsDTO>;

  quickAddOpen: boolean;
  quickAddInitialData: Partial<CreateTransactionDTO> | null;
  lastUsedAccountId: string;

  payBillOpen: boolean;
  payBillCardId: string | null;

  // Actions
  initialize: (userId?: string) => Promise<void>;
  reset: () => void;
  refreshAccounts: () => Promise<void>;
  refreshOverviewStats: (params?: {
    from?: string;
    to?: string;
    preset?: string;
    accounts?: string;
  }) => Promise<void>;
  refreshNetWorthHistory: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
  refreshCategories: () => Promise<void>;
  refreshBudgets: (filters?: BudgetFilters) => Promise<void>;
  openQuickAdd: (initialData?: Partial<CreateTransactionDTO>) => void;
  closeQuickAdd: () => void;
  openPayBill: (cardId?: string) => void;
  closePayBill: () => void;
  recalculateAccount: (accountId: string) => Promise<void>;
  setLastUsedAccountId: (id: string) => void;

  addTransaction: (
    data: CreateTransactionDTO,
    clientRequestId?: string
  ) => Promise<{ transaction: TransactionDTO; undo: () => Promise<void> }>;
  updateTransaction: (id: string, data: UpdateTransactionDTO) => Promise<TransactionDTO>;
  deleteTransaction: (id: string) => Promise<void>;
  bulkDeleteTransactions: (ids: string[]) => Promise<void>;
  bulkUpdateTransactions: (
    ids: string[],
    update: { categoryId?: string; accountId?: string }
  ) => Promise<void>;

  addAccount: (
    data: CreateAccountDTO & {
      openingBalance?: number;
      openingDate?: string;
      statementDay?: number;
      dueDay?: number;
    }
  ) => Promise<AccountWithBalance>;
  updateAccount: (id: string, data: UpdateAccountDTO) => Promise<AccountWithBalance>;
  deleteAccount: (id: string) => Promise<void>;

  addValuation: (data: CreateValuationDTO) => Promise<ValuationDTO>;

  addCategory: (data: CreateCategoryDTO) => Promise<CategoryDTO>;
  updateCategory: (id: string, data: UpdateCategoryDTO) => Promise<CategoryDTO>;
  deleteCategory: (id: string) => Promise<void>;

  addBudget: (data: CreateBudgetDTO) => Promise<BudgetDTO>;
  updateBudget: (id: string, data: UpdateBudgetDTO) => Promise<BudgetDTO>;
  deleteBudget: (id: string) => Promise<void>;
}

export const useFinanceStore = create<FinanceState>((set, get, api) => {
  api.getInitialState = () => get();

  return {
    userId: null,
    isInitialized: false,
    accountsStatus: 'idle',
    categoriesStatus: 'idle',
    transactionsStatus: 'idle',
    overviewStatus: 'idle',
    historyStatus: 'idle',
    budgetsStatus: 'idle',

    accounts: [],
    categories: [],
    transactions: [],
    budgets: [],
    budgetProgress: [],
    valuations: {},
    netWorthHistory: [],
    overviewStats: null,
    overviewCache: {},

    quickAddOpen: false,
    quickAddInitialData: null,
    lastUsedAccountId: '',
    payBillOpen: false,
    payBillCardId: null,

  reset: () => {
    set({
      userId: null,
      isInitialized: false,
      accountsStatus: 'idle',
      categoriesStatus: 'idle',
      transactionsStatus: 'idle',
      overviewStatus: 'idle',
      historyStatus: 'idle',
      budgetsStatus: 'idle',
      accounts: [],
      categories: [],
      transactions: [],
      budgets: [],
      budgetProgress: [],
      valuations: {},
      netWorthHistory: [],
      overviewStats: null,
      overviewCache: {},
      quickAddOpen: false,
      quickAddInitialData: null,
      lastUsedAccountId: '',
      payBillOpen: false,
      payBillCardId: null,
    });
  },

  refreshAccounts: async () => {
    set({ accountsStatus: 'loading' });
    try {
      const res = await fetch('/api/finance/accounts/balances', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      if (!res.ok) throw new Error(`Accounts request failed: ${res.status}`);
      const data = await res.json();
      set({
        accounts: Array.isArray(data.accounts) ? data.accounts : [],
        accountsStatus: 'ready',
      });
    } catch (err) {
      console.error('Failed to load accounts balances:', err);
      set({ accountsStatus: 'error' });
    }
  },

  refreshOverviewStats: async (params?: {
    from?: string;
    to?: string;
    preset?: string;
    accounts?: string;
  }) => {
    const sp = new URLSearchParams();
    if (params?.from) sp.set('from', params.from);
    if (params?.to) sp.set('to', params.to);
    if (params?.preset) sp.set('preset', params.preset);
    if (params?.accounts) sp.set('accounts', params.accounts);

    const filterKey = sp.toString() || 'default';
    set({ overviewStatus: 'loading' });
    try {
      const url =
        filterKey === 'default'
          ? '/api/finance/stats/overview'
          : `/api/finance/stats/overview?${sp.toString()}`;
      const res = await fetch(url, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      if (!res.ok) throw new Error(`Overview stats request failed: ${res.status}`);
      const data = await res.json();
      set((state) => ({
        overviewStats: data,
        overviewCache: {
          ...state.overviewCache,
          [filterKey]: data,
        },
        overviewStatus: 'ready',
      }));
    } catch (err) {
      console.error('Failed to load overview stats:', err);
      set({ overviewStatus: 'error' });
    }
  },

  refreshNetWorthHistory: async () => {
    set({ historyStatus: 'loading' });
    try {
      const res = await fetch('/api/finance/stats/net-worth-history', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      if (!res.ok) throw new Error(`Net worth history request failed: ${res.status}`);
      const data = await res.json();
      set({
        netWorthHistory: Array.isArray(data.history) ? data.history : [],
        historyStatus: 'ready',
      });
    } catch (err) {
      console.error('Failed to load net worth history:', err);
      set({ historyStatus: 'error' });
    }
  },

  refreshTransactions: async () => {
    set({ transactionsStatus: 'loading' });
    try {
      const res = await fetch('/api/finance/transactions', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      if (!res.ok) throw new Error(`Transactions request failed: ${res.status}`);
      const data = await res.json();
      set({
        transactions: Array.isArray(data.transactions) ? data.transactions : [],
        transactionsStatus: 'ready',
      });
    } catch (err) {
      console.error('Failed to load transactions:', err);
      set({ transactionsStatus: 'error' });
    }
  },

  refreshCategories: async () => {
    set({ categoriesStatus: 'loading' });
    try {
      const res = await fetch('/api/finance/categories', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      if (!res.ok) throw new Error(`Categories request failed: ${res.status}`);
      const data = await res.json();
      set({
        categories: Array.isArray(data.categories) ? data.categories : [],
        categoriesStatus: 'ready',
      });
    } catch (err) {
      console.error('Failed to load categories:', err);
      set({ categoriesStatus: 'error' });
    }
  },

  refreshBudgets: async (filters?: BudgetFilters) => {
    set({ budgetsStatus: 'loading' });
    try {
      const sp = new URLSearchParams();
      if (filters?.period) sp.set('period', filters.period);
      if (filters?.activeOnly !== undefined) sp.set('activeOnly', String(filters.activeOnly));

      const url = sp.toString() ? `/api/finance/budgets?${sp.toString()}` : '/api/finance/budgets';
      const res = await fetch(url, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      if (!res.ok) throw new Error(`Budgets request failed: ${res.status}`);
      const data = await res.json();
      set({
        budgets: Array.isArray(data.budgets) ? data.budgets : [],
        budgetProgress: Array.isArray(data.progress) ? data.progress : [],
        budgetsStatus: 'ready',
      });
    } catch (err) {
      console.error('Failed to load budgets:', err);
      set({ budgetsStatus: 'error' });
    }
  },

  initialize: async (userId?: string) => {
    const current = get();
    if (userId && current.userId && current.userId !== userId) {
      current.reset();
    }
    if (get().isInitialized && (!userId || get().userId === userId)) {
      return;
    }

    let resolvedUserId = userId ?? current.userId;
    if (!resolvedUserId && typeof window !== 'undefined') {
      try {
        const meRes = await fetch('/api/auth/me', {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        });
        if (meRes.ok) {
          const me = await meRes.json();
          if (me?.id) resolvedUserId = me.id;
        }
      } catch {
        // Ignore unauthenticated lookup errors
      }
    }

    set({
      userId: resolvedUserId ?? null,
      accountsStatus: 'loading',
      categoriesStatus: 'loading',
      transactionsStatus: 'loading',
      overviewStatus: 'loading',
      historyStatus: 'loading',
      budgetsStatus: 'loading',
    });

    await Promise.all([
      get().refreshAccounts(),
      get().refreshCategories(),
      get().refreshTransactions(),
      get().refreshOverviewStats(),
      get().refreshNetWorthHistory(),
      get().refreshBudgets(),
    ]);

    set({ isInitialized: true });
  },

  openQuickAdd: (initialData) => {
    set({ quickAddOpen: true, quickAddInitialData: initialData || null });
  },

  closeQuickAdd: () => {
    set({ quickAddOpen: false, quickAddInitialData: null });
  },

  openPayBill: (cardId) => {
    set({ payBillOpen: true, payBillCardId: cardId || null, quickAddOpen: false });
  },

  closePayBill: () => {
    set({ payBillOpen: false, payBillCardId: null });
  },

  recalculateAccount: async (accountId: string) => {
    const res = await fetch(`/api/finance/accounts/${accountId}/recalculate`, {
      method: 'POST',
    });
    if (!res.ok) {
      throw new Error(`Failed to recalculate account valuations (${res.status})`);
    }
    await Promise.all([
      get().refreshAccounts(),
      get().refreshOverviewStats(),
      get().refreshNetWorthHistory(),
    ]);
  },

  setLastUsedAccountId: (id) => {
    set({ lastUsedAccountId: id });
  },

  addTransaction: async (data, clientRequestId) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (clientRequestId) {
      headers['x-client-request-id'] = clientRequestId;
    }

    const res = await fetch('/api/finance/transactions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...data,
        clientRequestId: clientRequestId ?? data.clientRequestId,
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(
        errBody?.error?.message ||
          errBody?.error ||
          `Failed to create transaction (${res.status})`
      );
    }

    const body = await res.json();
    const tx: TransactionDTO = body.transaction;

    await Promise.all([
      get().refreshAccounts(),
      get().refreshOverviewStats(),
      get().refreshNetWorthHistory(),
      get().refreshTransactions(),
      get().refreshBudgets(),
    ]);

    return {
      transaction: tx,
      undo: async () => {
        await fetch(`/api/finance/transactions/${tx.id}`, { method: 'DELETE' });
        await Promise.all([
          get().refreshAccounts(),
          get().refreshOverviewStats(),
          get().refreshNetWorthHistory(),
          get().refreshTransactions(),
          get().refreshBudgets(),
        ]);
      },
    };
  },

  updateTransaction: async (id, data) => {
    const res = await fetch(`/api/finance/transactions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(
        errBody?.error?.message ||
          errBody?.error ||
          `Failed to update transaction (${res.status})`
      );
    }

    const body = await res.json();
    await Promise.all([
      get().refreshAccounts(),
      get().refreshOverviewStats(),
      get().refreshNetWorthHistory(),
      get().refreshTransactions(),
      get().refreshBudgets(),
    ]);
    return body.transaction;
  },

  deleteTransaction: async (id) => {
    const res = await fetch(`/api/finance/transactions/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(
        errBody?.error?.message ||
          errBody?.error ||
          `Failed to delete transaction (${res.status})`
      );
    }
    await Promise.all([
      get().refreshAccounts(),
      get().refreshOverviewStats(),
      get().refreshNetWorthHistory(),
      get().refreshTransactions(),
      get().refreshBudgets(),
    ]);
  },

  bulkDeleteTransactions: async (ids) => {
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/finance/transactions/${id}`, { method: 'DELETE' })
      )
    );
    await Promise.all([
      get().refreshAccounts(),
      get().refreshOverviewStats(),
      get().refreshNetWorthHistory(),
      get().refreshTransactions(),
      get().refreshBudgets(),
    ]);
  },

  bulkUpdateTransactions: async (ids, update) => {
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/finance/transactions/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        })
      )
    );
    await Promise.all([
      get().refreshAccounts(),
      get().refreshOverviewStats(),
      get().refreshNetWorthHistory(),
      get().refreshTransactions(),
      get().refreshBudgets(),
    ]);
  },

  addBudget: async (data: CreateBudgetDTO) => {
    const res = await fetch('/api/finance/budgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(
        errBody?.error?.message || errBody?.error || `Failed to create budget (${res.status})`
      );
    }
    const body = await res.json();
    await Promise.all([get().refreshBudgets(), get().refreshOverviewStats()]);
    return body.budget;
  },

  updateBudget: async (id: string, data: UpdateBudgetDTO) => {
    const res = await fetch(`/api/finance/budgets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(
        errBody?.error?.message || errBody?.error || `Failed to update budget (${res.status})`
      );
    }
    const body = await res.json();
    await Promise.all([get().refreshBudgets(), get().refreshOverviewStats()]);
    return body.budget;
  },

  deleteBudget: async (id: string) => {
    const res = await fetch(`/api/finance/budgets/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(
        errBody?.error?.message || errBody?.error || `Failed to delete budget (${res.status})`
      );
    }
    await Promise.all([get().refreshBudgets(), get().refreshOverviewStats()]);
  },

  addAccount: async (data) => {
    const res = await fetch('/api/finance/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        kind: data.kind,
        currency: data.currency || 'INR',
        creditLimit: data.creditLimit,
        metadata: {
          ...(data.metadata || {}),
          ...(data.statementDay !== undefined ? { statementDay: data.statementDay } : {}),
          ...(data.dueDay !== undefined ? { dueDay: data.dueDay } : {}),
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(
        errBody?.error?.message ||
          errBody?.error ||
          `Failed to create account (${res.status})`
      );
    }

    const { account } = await res.json();

    if (data.openingBalance !== undefined && data.openingBalance !== 0) {
      await fetch(`/api/finance/accounts/${account.id}/opening`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openingBalancePaise: data.openingBalance,
          openingDate: data.openingDate || new Date().toISOString().slice(0, 10),
        }),
      }).catch(() => {});
    }

    await Promise.all([get().refreshAccounts(), get().refreshOverviewStats()]);
    const found = get().accounts.find((a) => a.id === account.id);
    const isLiability = ['credit_card', 'loan', 'other_liability'].includes(data.kind);
    return (
      found ?? {
        ...account,
        balance: isLiability ? -Math.abs(data.openingBalance ?? 0) : data.openingBalance ?? 0,
        outstanding: isLiability ? Math.abs(data.openingBalance ?? 0) : 0,
        utilization:
          isLiability && (data.creditLimit || 0) > 0
            ? Math.min(1, Math.abs(data.openingBalance ?? 0) / data.creditLimit!)
            : 0,
        currentValue: isLiability ? 0 : (data.openingBalance ?? 0),
        statementDay: data.statementDay,
        dueDay: data.dueDay,
        dueDays: (data.metadata?.dueDays as number) || data.dueDay,
        isOffsetDays: true,
      }
    );
  },

  updateAccount: async (id, data) => {
    const res = await fetch(`/api/finance/accounts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(
        errBody?.error?.message ||
          errBody?.error ||
          `Failed to update account (${res.status})`
      );
    }

    const { account } = await res.json();
    await Promise.all([get().refreshAccounts(), get().refreshOverviewStats()]);
    const found = get().accounts.find((a) => a.id === id);
    return (
      found ?? {
        ...account,
        balance: 0,
        outstanding: 0,
        utilization: 0,
        currentValue: 0,
      }
    );
  },

  deleteAccount: async (id) => {
    const res = await fetch(`/api/finance/accounts/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(
        errBody?.error?.message ||
          errBody?.error ||
          `Failed to delete account (${res.status})`
      );
    }
    await Promise.all([get().refreshAccounts(), get().refreshOverviewStats()]);
  },

  addValuation: async (data) => {
    const res = await fetch('/api/finance/valuations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(
        errBody?.error?.message ||
          errBody?.error ||
          `Failed to create valuation (${res.status})`
      );
    }

    const { valuation } = await res.json();
    await Promise.all([
      get().refreshAccounts(),
      get().refreshOverviewStats(),
      get().refreshNetWorthHistory(),
    ]);
    return valuation;
  },

  addCategory: async (data) => {
    const res = await fetch('/api/finance/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(
        errBody?.error?.message ||
          errBody?.error ||
          `Failed to create category (${res.status})`
      );
    }

    const { category } = await res.json();
    await get().refreshCategories();
    return category;
  },

  updateCategory: async (id, data) => {
    const res = await fetch(`/api/finance/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(
        errBody?.error?.message ||
          errBody?.error ||
          `Failed to update category (${res.status})`
      );
    }

    const { category } = await res.json();
    await get().refreshCategories();
    return category;
  },

  deleteCategory: async (id) => {
    const res = await fetch(`/api/finance/categories/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(
        errBody?.error?.message ||
          errBody?.error ||
          `Failed to delete category (${res.status})`
      );
    }
    await get().refreshCategories();
  },
  };
});
