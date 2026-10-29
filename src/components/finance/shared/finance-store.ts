'use client';

import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type {
  CategoryDTO,
  CreateAccountDTO,
  CreateCategoryDTO,
  CreateTransactionDTO,
  CreateValuationDTO,
  NetWorthPointDTO,
  OverviewStatsDTO,
  TransactionDTO,
  UpdateAccountDTO,
  UpdateCategoryDTO,
  UpdateTransactionDTO,
  ValuationDTO,
} from '@src/lib/finance/contract';
import {
  FIXTURE_ACCOUNTS,
  FIXTURE_CATEGORIES,
  FIXTURE_NET_WORTH_HISTORY,
  FIXTURE_OVERVIEW_STATS,
  FIXTURE_TRANSACTIONS,
  FIXTURE_VALUATIONS,
  type AccountWithBalance,
} from './fixtures';

export interface FinanceState {
  accounts: AccountWithBalance[];
  categories: CategoryDTO[];
  transactions: TransactionDTO[];
  valuations: Record<string, ValuationDTO[]>;
  netWorthHistory: NetWorthPointDTO[];
  overviewStats: OverviewStatsDTO;
  quickAddOpen: boolean;
  quickAddInitialData: Partial<CreateTransactionDTO> | null;
  lastUsedAccountId: string;
  payeeCategoryMap: Record<string, string>;
  isInitialized: boolean;
  loading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  openQuickAdd: (initialData?: Partial<CreateTransactionDTO>) => void;
  closeQuickAdd: () => void;
  setLastUsedAccountId: (id: string) => void;

  addTransaction: (
    data: CreateTransactionDTO,
    clientRequestId?: string
  ) => Promise<{ transaction: TransactionDTO; undo: () => void }>;
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
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  accounts: FIXTURE_ACCOUNTS,
  categories: FIXTURE_CATEGORIES,
  transactions: FIXTURE_TRANSACTIONS,
  valuations: FIXTURE_VALUATIONS,
  netWorthHistory: FIXTURE_NET_WORTH_HISTORY,
  overviewStats: FIXTURE_OVERVIEW_STATS,
  quickAddOpen: false,
  quickAddInitialData: null,
  lastUsedAccountId: 'acc-hdfc-salary',
  payeeCategoryMap: {
    'nature basket': 'cat-groceries',
    'toit brewpub': 'cat-food',
    'shell petrol pump': 'cat-fuel',
    'bescom bangalore': 'cat-utilities',
    'amazon india': 'cat-shopping',
    'netflix india': 'cat-subscriptions',
    'landlord - s. sharma': 'cat-rent',
    'metro auto rickshaw': 'cat-transport',
  },
  isInitialized: false,
  loading: false,
  error: null,

  initialize: async () => {
    if (get().isInitialized) return;
    set({ loading: true, error: null });

    try {
      // Attempt to load from API if backend is running, otherwise fall back to fixtures
      const accRes = await fetch('/api/finance/accounts').catch(() => null);
      if (accRes && accRes.ok) {
        const json = await accRes.json();
        if (json.accounts && Array.isArray(json.accounts) && json.accounts.length > 0) {
          set({ accounts: json.accounts });
        }
      }

      const catRes = await fetch('/api/finance/categories').catch(() => null);
      if (catRes && catRes.ok) {
        const json = await catRes.json();
        if (json.categories && Array.isArray(json.categories) && json.categories.length > 0) {
          set({ categories: json.categories });
        }
      }

      const txRes = await fetch('/api/finance/transactions').catch(() => null);
      if (txRes && txRes.ok) {
        const json = await txRes.json();
        if (json.transactions && Array.isArray(json.transactions) && json.transactions.length > 0) {
          set({ transactions: json.transactions });
        }
      }
    } catch {
      // In-memory fallback is already populated with high-fidelity fixtures
    } finally {
      set({ isInitialized: true, loading: false });
    }
  },

  openQuickAdd: (initialData) => {
    set({ quickAddOpen: true, quickAddInitialData: initialData || null });
  },

  closeQuickAdd: () => {
    set({ quickAddOpen: false, quickAddInitialData: null });
  },

  setLastUsedAccountId: (id) => {
    set({ lastUsedAccountId: id });
  },

  addTransaction: async (data, clientRequestId) => {
    const id = `tx-${nanoid(10)}`;
    const now = new Date().toISOString();
    const reqId = clientRequestId || nanoid(16);

    let signedAmount = data.amount;
    if (data.type === 'expense' || data.type === 'transfer') {
      signedAmount = -data.amount;
    }

    const newTx: TransactionDTO = {
      id,
      userId: 'usr-1',
      accountId: data.accountId,
      toAccountId: data.toAccountId || null,
      categoryId: data.categoryId || null,
      date: data.date,
      type: data.type,
      amount: data.amount,
      signedAmount,
      payee: data.payee || null,
      note: data.note || null,
      tags: data.tags || null,
      clientRequestId: reqId,
      isRecurring: data.isRecurring || false,
      recurringRuleId: data.recurringRuleId || null,
      createdAt: now,
      updatedAt: now,
    };

    // Snapshot state for undo
    const prevTransactions = get().transactions;
    const prevAccounts = get().accounts;
    const prevOverview = get().overviewStats;

    // Optimistically update accounts
    const updatedAccounts = prevAccounts.map((acc) => {
      if (acc.id === data.accountId) {
        let newBalance = acc.balance;
        if (data.type === 'expense') {
          newBalance -= data.amount;
        } else if (data.type === 'income') {
          newBalance += data.amount;
        } else if (data.type === 'transfer') {
          newBalance -= data.amount;
        }
        const outstanding = acc.class === 'liability' ? Math.max(0, -newBalance) : 0;
        const limit = acc.creditLimit || 0;
        const utilization = limit > 0 ? Math.min(1, outstanding / limit) : 0;
        return { ...acc, balance: newBalance, outstanding, utilization };
      }
      if (data.type === 'transfer' && acc.id === data.toAccountId) {
        const newBalance = acc.balance + data.amount;
        const outstanding = acc.class === 'liability' ? Math.max(0, -newBalance) : 0;
        const limit = acc.creditLimit || 0;
        const utilization = limit > 0 ? Math.min(1, outstanding / limit) : 0;
        return { ...acc, balance: newBalance, outstanding, utilization };
      }
      return acc;
    });

    // Update payee-category map
    const newPayeeMap = { ...get().payeeCategoryMap };
    if (data.payee && data.categoryId) {
      newPayeeMap[data.payee.trim().toLowerCase()] = data.categoryId;
    }

    // Update overview stats
    const newOverview = { ...prevOverview };
    if (data.type === 'income') {
      newOverview.monthlyIncome += data.amount;
    } else if (data.type === 'expense') {
      newOverview.monthlyExpense += data.amount;
    }
    if (newOverview.monthlyIncome > 0) {
      newOverview.savingsRate = Math.max(
        0,
        Math.round(
          ((newOverview.monthlyIncome - newOverview.monthlyExpense) /
            newOverview.monthlyIncome) *
            1000
        ) / 10
      );
    }

    set({
      transactions: [newTx, ...prevTransactions],
      accounts: updatedAccounts,
      overviewStats: newOverview,
      lastUsedAccountId: data.accountId,
      payeeCategoryMap: newPayeeMap,
    });

    // Background server sync attempt
    fetch('/api/finance/transactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Request-Id': reqId,
      },
      body: JSON.stringify(data),
    }).catch(() => {
      // In mock mode or offline, state is safely preserved locally
    });

    const undo = () => {
      set({
        transactions: prevTransactions,
        accounts: prevAccounts,
        overviewStats: prevOverview,
      });
      fetch(`/api/finance/transactions/${id}`, { method: 'DELETE' }).catch(() => {});
    };

    return { transaction: newTx, undo };
  },

  updateTransaction: async (id, data) => {
    const prevList = get().transactions;
    const index = prevList.findIndex((t) => t.id === id);
    if (index === -1) throw new Error('Transaction not found');

    const updated: TransactionDTO = {
      ...prevList[index],
      ...data,
      amount: data.amount !== undefined ? data.amount : prevList[index].amount,
      updatedAt: new Date().toISOString(),
    };

    const nextList = [...prevList];
    nextList[index] = updated;
    set({ transactions: nextList });

    fetch(`/api/finance/transactions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(() => {});

    return updated;
  },

  deleteTransaction: async (id) => {
    const prev = get().transactions;
    set({ transactions: prev.filter((t) => t.id !== id) });
    fetch(`/api/finance/transactions/${id}`, { method: 'DELETE' }).catch(() => {});
  },

  bulkDeleteTransactions: async (ids) => {
    const idSet = new Set(ids);
    set({ transactions: get().transactions.filter((t) => !idSet.has(t.id)) });
    await Promise.allSettled(
      ids.map((id) => fetch(`/api/finance/transactions/${id}`, { method: 'DELETE' }))
    );
  },

  bulkUpdateTransactions: async (ids, update) => {
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    set({
      transactions: get().transactions.map((t) => {
        if (idSet.has(t.id)) {
          return {
            ...t,
            categoryId: update.categoryId !== undefined ? update.categoryId : t.categoryId,
            accountId: update.accountId !== undefined ? update.accountId : t.accountId,
            updatedAt: now,
          };
        }
        return t;
      }),
    });
    await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/finance/transactions/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        })
      )
    );
  },

  addAccount: async (data) => {
    const id = `acc-${nanoid(8)}`;
    const now = new Date().toISOString();
    const isLiability =
      data.kind === 'credit_card' || data.kind === 'loan' || data.kind === 'other_liability';

    const openingBalance = data.openingBalance || 0;
    const balance = isLiability ? -Math.abs(openingBalance) : openingBalance;
    const creditLimit = data.creditLimit || null;
    const outstanding = isLiability ? Math.abs(balance) : 0;
    const utilization =
      creditLimit && creditLimit > 0 ? Math.min(1, outstanding / creditLimit) : 0;

    const newAcc: AccountWithBalance = {
      id,
      userId: 'usr-1',
      name: data.name,
      kind: data.kind,
      class: isLiability ? 'liability' : 'asset',
      currency: data.currency || 'INR',
      creditLimit,
      isActive: true,
      metadata: {
        ...(data.metadata || {}),
        statementDay: data.statementDay,
        dueDay: data.dueDay,
      },
      balance,
      outstanding,
      utilization,
      currentValue: balance,
      statementDay: data.statementDay,
      dueDay: data.dueDay,
      createdAt: now,
      updatedAt: now,
    };

    set({ accounts: [...get().accounts, newAcc] });

    fetch('/api/finance/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(() => {});

    return newAcc;
  },

  updateAccount: async (id, data) => {
    const prevList = get().accounts;
    const index = prevList.findIndex((a) => a.id === id);
    if (index === -1) throw new Error('Account not found');

    const updated: AccountWithBalance = {
      ...prevList[index],
      ...data,
      metadata: {
        ...prevList[index].metadata,
        ...(data.metadata || {}),
      },
      updatedAt: new Date().toISOString(),
    };

    const nextList = [...prevList];
    nextList[index] = updated;
    set({ accounts: nextList });

    fetch(`/api/finance/accounts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(() => {});

    return updated;
  },

  deleteAccount: async (id) => {
    set({ accounts: get().accounts.filter((a) => a.id !== id) });
    fetch(`/api/finance/accounts/${id}`, { method: 'DELETE' }).catch(() => {});
  },

  addValuation: async (data) => {
    const id = `val-${nanoid(8)}`;
    const now = new Date().toISOString();
    const newVal: ValuationDTO = {
      id,
      accountId: data.accountId,
      date: data.date,
      value: data.value,
      costBasis: data.costBasis || null,
      note: data.note || null,
      createdAt: now,
      updatedAt: now,
    };

    const curVals = get().valuations[data.accountId] || [];
    const nextVals = [...curVals, newVal].sort((a, b) => a.date.localeCompare(b.date));

    // Update account's current value and gain
    const updatedAccounts = get().accounts.map((acc) => {
      if (acc.id === data.accountId) {
        const costBasis = data.costBasis !== undefined ? (data.costBasis ?? acc.costBasis ?? acc.balance) : (acc.costBasis ?? acc.balance);
        const gain = data.value - costBasis;
        const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;
        return {
          ...acc,
          currentValue: data.value,
          costBasis,
          gain,
          gainPct: Math.round(gainPct * 10) / 10,
        };
      }
      return acc;
    });

    // Update net worth points
    const netWorthHistory = [...get().netWorthHistory];
    const latestDate = data.date;
    const existingIndex = netWorthHistory.findIndex((p) => p.date === latestDate);
    const totalAssets = updatedAccounts
      .filter((a) => a.class === 'asset')
      .reduce((sum, a) => sum + (a.currentValue || a.balance), 0);
    const totalLiabilities = updatedAccounts
      .filter((a) => a.class === 'liability')
      .reduce((sum, a) => sum + a.outstanding, 0);
    const netWorth = totalAssets - totalLiabilities;

    if (existingIndex >= 0) {
      netWorthHistory[existingIndex] = {
        date: latestDate,
        assets: totalAssets,
        liabilities: totalLiabilities,
        netWorth,
      };
    } else {
      netWorthHistory.push({
        date: latestDate,
        assets: totalAssets,
        liabilities: totalLiabilities,
        netWorth,
      });
      netWorthHistory.sort((a, b) => a.date.localeCompare(b.date));
    }

    set({
      valuations: {
        ...get().valuations,
        [data.accountId]: nextVals,
      },
      accounts: updatedAccounts,
      netWorthHistory,
      overviewStats: {
        ...get().overviewStats,
        netWorth,
        totalAssets,
        totalLiabilities,
      },
    });

    fetch('/api/finance/valuations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(() => {});

    return newVal;
  },

  addCategory: async (data) => {
    const id = `cat-${nanoid(8)}`;
    const now = new Date().toISOString();
    const newCat: CategoryDTO = {
      id,
      userId: 'usr-1',
      name: data.name,
      type: data.type,
      parentId: data.parentId || null,
      icon: data.icon || null,
      color: data.color || '#3b82f6',
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    };

    set({ categories: [...get().categories, newCat] });

    fetch('/api/finance/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(() => {});

    return newCat;
  },

  updateCategory: async (id, data) => {
    const prevList = get().categories;
    const index = prevList.findIndex((c) => c.id === id);
    if (index === -1) throw new Error('Category not found');

    const updated: CategoryDTO = {
      ...prevList[index],
      ...data,
      updatedAt: new Date().toISOString(),
    };

    const nextList = [...prevList];
    nextList[index] = updated;
    set({ categories: nextList });

    fetch(`/api/finance/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(() => {});

    return updated;
  },

  deleteCategory: async (id) => {
    set({ categories: get().categories.filter((c) => c.id !== id) });
    fetch(`/api/finance/categories/${id}`, { method: 'DELETE' }).catch(() => {});
  },
}));
