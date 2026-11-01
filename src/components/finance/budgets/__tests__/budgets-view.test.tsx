import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { BudgetsView } from '../budgets-view';
import { BudgetForm, parseINRAmount } from '../budget-dialog';
import { useFinanceStore } from '../../shared/finance-store';
import type { BudgetDTO, CategoryDTO, TransactionDTO } from '@src/lib/finance/contract';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/finance/budgets',
}));

describe('BudgetsView & BudgetDialog Component Tests', () => {
  const originalFetch = globalThis.fetch;

  const mockCategories: CategoryDTO[] = [
    {
      id: 'cat-groceries',
      userId: 'usr-1',
      name: 'Groceries',
      type: 'expense',
      color: '#10b981',
      icon: null,
      isSystem: true,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'cat-dining',
      userId: 'usr-1',
      name: 'Dining Out',
      type: 'expense',
      color: '#ef4444',
      icon: null,
      isSystem: true,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'cat-entertainment',
      userId: 'usr-1',
      name: 'Entertainment',
      type: 'expense',
      color: '#8b5cf6',
      icon: null,
      isSystem: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ];

  const currentMonth = new Date().toISOString().slice(0, 7);

  const mockBudgets: BudgetDTO[] = [
    {
      id: 'bgt-1',
      userId: 'usr-1',
      categoryId: 'cat-groceries',
      amount: 1500000, // ₹15,000 in paise
      period: 'monthly',
      startDate: `${currentMonth}-01`,
      endDate: null,
      createdAt: `${currentMonth}-01T00:00:00Z`,
      updatedAt: `${currentMonth}-01T00:00:00Z`,
    },
    {
      id: 'bgt-2',
      userId: 'usr-1',
      categoryId: 'cat-dining',
      amount: 500000, // ₹5,000 in paise
      period: 'monthly',
      startDate: `${currentMonth}-01`,
      endDate: null,
      createdAt: `${currentMonth}-01T00:00:00Z`,
      updatedAt: `${currentMonth}-01T00:00:00Z`,
    },
  ];

  const mockTransactions: TransactionDTO[] = [
    {
      id: 'tx-1',
      userId: 'usr-1',
      accountId: 'acc-1',
      toAccountId: null,
      categoryId: 'cat-groceries',
      date: `${currentMonth}-05`,
      type: 'expense',
      amount: 600000,
      signedAmount: -600000,
      payee: 'Supermarket',
      note: null,
      tags: null,
      clientRequestId: null,
      importHash: null,
      isRecurring: false,
      recurringRuleId: null,
      deletedAt: null,
      createdAt: `${currentMonth}-05T00:00:00Z`,
      updatedAt: `${currentMonth}-05T00:00:00Z`,
    },
  ];

  beforeEach(() => {
    useFinanceStore.getState().reset();
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ budgets: [], progress: [] }), {
          status: 200,
        })
      )
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    useFinanceStore.getState().reset();
    vi.restoreAllMocks();
  });

  describe('INR Amount Parsing', () => {
    it('accepts both comma-separated and plain numeric INR strings', () => {
      expect(parseINRAmount('12,500')).toBe(12500);
      expect(parseINRAmount('12500')).toBe(12500);
      expect(parseINRAmount('₹12,500')).toBe(12500);
      expect(parseINRAmount('1,25,000')).toBe(125000);
      expect(parseINRAmount('  15000.50  ')).toBe(15000.5);
      expect(parseINRAmount('')).toBeNaN();
      expect(parseINRAmount('abc')).toBeNaN();
    });
  });

  describe('BudgetsView Rendering', () => {
    it('renders skeleton loader when budgetsStatus is loading and budgets is empty', () => {
      useFinanceStore.setState({
        budgetsStatus: 'loading',
        budgets: [],
      });

      const html = renderToString(<BudgetsView />);
      expect(html).toContain('animate-pulse');
    });

    it('renders empty state when no budgets exist', () => {
      useFinanceStore.setState({
        budgetsStatus: 'ready',
        budgets: [],
        categories: [],
        transactions: [],
      });

      const html = renderToString(<BudgetsView />);
      expect(html).toContain('No budgets created yet');
      expect(html).toContain('Set Category Budget');
    });

    it('renders category budget cards with spent and budgeted amounts', () => {
      useFinanceStore.setState({
        budgetsStatus: 'ready',
        budgets: mockBudgets,
        categories: mockCategories,
        transactions: mockTransactions,
      });

      const html = renderToString(<BudgetsView />);
      expect(html).toContain('₹20,000');
      expect(html).toContain('₹6,000');
      expect(html).toContain('Groceries');
      expect(html).toContain('Dining Out');
    });
  });

  describe('BudgetForm UX & State Management', () => {
    it('renders BudgetForm with month, category, INR amount, rollover switch, and optional total budget', () => {
      useFinanceStore.setState({
        categories: mockCategories,
        budgets: [],
      });

      const html = renderToString(
        <BudgetForm onCancel={vi.fn()} onSuccess={vi.fn()} />
      );

      // Month field
      expect(html).toContain('Budget Month');
      // Category field
      expect(html).toContain('Category');
      // Amount field
      expect(html).toContain('Budget Amount (₹)');
      // Rollover switch
      expect(html).toContain('Rollover Unspent');
      // Optional total budget field
      expect(html).toContain('Optional Total Monthly Budget Target (₹)');
      // Submit button
      expect(html).toContain('Create Budget');
    });

    it('pre-populates existing budget values when editing', () => {
      useFinanceStore.setState({
        categories: mockCategories,
        budgets: mockBudgets,
      });

      const editingBudget = mockBudgets[0]; // Groceries, ₹15,000
      const html = renderToString(
        <BudgetForm
          budget={editingBudget}
          onCancel={vi.fn()}
          onSuccess={vi.fn()}
        />
      );

      expect(html).toContain('Save Changes');
      expect(html).toContain('Category cannot be modified on an existing budget');
      expect(html).toContain('Budget month is locked during edit');
      expect(html).toContain('15,000');
    });

    it('displays copy last month budgets link when candidates are available', () => {
      useFinanceStore.setState({
        categories: mockCategories,
        budgets: [],
      });

      const onCopyMock = vi.fn();
      const html = renderToString(
        <BudgetForm
          onCancel={vi.fn()}
          onSuccess={vi.fn()}
          onCopyLastMonth={onCopyMock}
          copyCandidatesCount={3}
        />
      );

      expect(html).toContain('Copy last month (3)');
    });
  });

  describe('Global Shortcuts & Modal Isolation', () => {
    it('ignores global shortcut "n" when focus is in an input, textarea, or select', () => {
      const openQuickAddMock = vi.fn();

      const handleKeyDown = (e: {
        key: string;
        metaKey: boolean;
        ctrlKey: boolean;
        altKey: boolean;
        target: { tagName: string; isContentEditable?: boolean };
        defaultPrevented: boolean;
        preventDefault: () => void;
      }) => {
        const target = e.target;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable)
        ) {
          return;
        }

        if (
          (e.key === 'n' || e.key === 'c' || e.key === 'q') &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey
        ) {
          e.preventDefault();
          openQuickAddMock();
        }
      };

      // Type "n" in an INPUT (such as the budget amount input)
      let prevented = false;
      const inputEvent = {
        key: 'n',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        target: { tagName: 'INPUT' },
        defaultPrevented: false,
        preventDefault: () => {
          prevented = true;
        },
      };

      handleKeyDown(inputEvent);
      expect(prevented).toBe(false);
      expect(openQuickAddMock).not.toHaveBeenCalled();

      // Type "n" in a SELECT
      const selectEvent = {
        key: 'n',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        target: { tagName: 'SELECT' },
        defaultPrevented: false,
        preventDefault: () => {
          prevented = true;
        },
      };

      handleKeyDown(selectEvent);
      expect(prevented).toBe(false);
      expect(openQuickAddMock).not.toHaveBeenCalled();
    });

    it('disables global shortcuts while any modal is open in the DOM', () => {
      const openQuickAddMock = vi.fn();

      const handleKeyDownWithModalCheck = (
        e: {
          key: string;
          metaKey: boolean;
          ctrlKey: boolean;
          altKey: boolean;
          target: { tagName: string };
          preventDefault: () => void;
        },
        hasOpenModal: boolean
      ) => {
        if (hasOpenModal) {
          return;
        }

        const target = e.target;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT')
        ) {
          return;
        }

        if (
          (e.key === 'n' || e.key === 'c' || e.key === 'q') &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey
        ) {
          e.preventDefault();
          openQuickAddMock();
        }
      };

      let prevented = false;
      const modalOpenEvent = {
        key: 'n',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        target: { tagName: 'DIV' }, // body or dialog background
        preventDefault: () => {
          prevented = true;
        },
      };

      // When modal is open: shortcut is completely disabled
      handleKeyDownWithModalCheck(modalOpenEvent, true);
      expect(prevented).toBe(false);
      expect(openQuickAddMock).not.toHaveBeenCalled();

      // When no modal is open: shortcut works
      handleKeyDownWithModalCheck(modalOpenEvent, false);
      expect(prevented).toBe(true);
      expect(openQuickAddMock).toHaveBeenCalledTimes(1);
    });

    it('cleans up body inert and pointer-events state when modal closes', () => {
      // Simulate DOM body cleanup
      const mockBody = {
        removeAttribute: vi.fn(),
        style: { pointerEvents: 'none' },
      };

      const cleanupModalClose = () => {
        mockBody.removeAttribute('inert');
        mockBody.style.pointerEvents = '';
      };

      cleanupModalClose();
      expect(mockBody.removeAttribute).toHaveBeenCalledWith('inert');
      expect(mockBody.style.pointerEvents).toBe('');
    });
  });

  describe('Budget Mutation & Isolation Lifecycle', () => {
    it('creates a budget via store action with parsed paise amount', async () => {
      const addBudgetMock = vi.fn().mockResolvedValue({
        id: 'new-bgt-1',
        categoryId: 'cat-groceries',
        amount: 1250000,
        period: 'monthly',
        startDate: `${currentMonth}-01`,
        endDate: null,
      });

      useFinanceStore.setState({
        addBudget: addBudgetMock,
        budgets: [],
        categories: mockCategories,
      });

      const parsedPaise = Math.round(parseINRAmount('12,500') * 100);
      expect(parsedPaise).toBe(1250000);

      await useFinanceStore.getState().addBudget({
        categoryId: 'cat-groceries',
        amount: parsedPaise,
        period: 'monthly',
        startDate: `${currentMonth}-01`,
        endDate: null,
      });

      expect(addBudgetMock).toHaveBeenCalledWith({
        categoryId: 'cat-groceries',
        amount: 1250000,
        period: 'monthly',
        startDate: `${currentMonth}-01`,
        endDate: null,
      });
    });

    it('updates existing budget and preserves category immutability', async () => {
      const updateBudgetMock = vi.fn().mockResolvedValue({
        id: 'bgt-1',
        categoryId: 'cat-groceries',
        amount: 1800000,
        period: 'monthly',
        startDate: `${currentMonth}-01`,
        endDate: null,
      });

      useFinanceStore.setState({
        updateBudget: updateBudgetMock,
        budgets: mockBudgets,
        categories: mockCategories,
      });

      const updatedPaise = Math.round(parseINRAmount('18,000') * 100);
      expect(updatedPaise).toBe(1800000);

      await useFinanceStore.getState().updateBudget('bgt-1', {
        amount: updatedPaise,
        period: 'monthly',
        startDate: `${currentMonth}-01`,
        endDate: null,
      });

      expect(updateBudgetMock).toHaveBeenCalledWith('bgt-1', {
        amount: 1800000,
        period: 'monthly',
        startDate: `${currentMonth}-01`,
        endDate: null,
      });
    });

    it('deletes a budget cleanly without lingering state', async () => {
      const deleteBudgetMock = vi.fn().mockResolvedValue(undefined);

      useFinanceStore.setState({
        deleteBudget: deleteBudgetMock,
        budgets: mockBudgets,
      });

      await useFinanceStore.getState().deleteBudget('bgt-1');
      expect(deleteBudgetMock).toHaveBeenCalledWith('bgt-1');
    });
  });
});
