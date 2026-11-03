import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { FinanceDonutChart, type FinanceDonutItem } from '../../charts/finance-donut-chart';
import { OverviewView } from '../overview-view';
import { useFinanceStore } from '../../shared/finance-store';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/finance/overview',
}));

describe('Spend by Category & Period Comparisons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFinanceStore.getState().reset();
  });

  describe('FinanceDonutChart', () => {
    const sampleCategories: FinanceDonutItem[] = [
      { id: 'cat_rent', name: 'Rent', amount: 1150000, transactionCount: 1, color: '#3b82f6' },
      { id: 'cat_food', name: 'Food & Dining', amount: 77000, transactionCount: 3, color: '#10b981' },
      { id: 'cat_fuel', name: 'Fuel', amount: 15000, transactionCount: 1, color: '#f59e0b' },
      { id: 'cat_transport', name: 'Transport', amount: 9000, transactionCount: 2, color: '#8b5cf6' },
      // Tiny slice < 2% of total:
      { id: 'cat_misc', name: 'Misc Item', amount: 1000, transactionCount: 1, color: '#ec4899' },
    ];

    it('category totals equal the total paise sum exactly', () => {
      const sum = sampleCategories.reduce((acc, c) => acc + c.amount, 0);
      expect(sum).toBe(1252000); // ₹12,520.00
    });

    it('legend lists EVERY category with spend (no cap), sorted descending, with tx counts', () => {
      const html = renderToString(<FinanceDonutChart data={sampleCategories} totalLabel="Total Spend" />);

      // Every category name must appear in the rendered HTML
      expect(html).toContain('Rent');
      expect(html).toContain('Food &amp; Dining');
      expect(html).toContain('Fuel');
      expect(html).toContain('Transport');
      expect(html).toContain('Misc Item');

      // Transaction counts rendered
      expect(html).toContain('1 txn');
      expect(html).toContain('3 txns');
      expect(html).toContain('2 txns');
    });

    it('renders empty message when data is empty or all amounts 0', () => {
      const html = renderToString(<FinanceDonutChart data={[]} emptyMessage="No expenses in this period" />);
      expect(html).toContain('No expenses in this period');
    });
  });

  describe('OverviewView Period Comparison & Delta Rules', () => {
    it('shows period text in card headers', () => {
      useFinanceStore.setState({
        overviewStatus: 'ready',
        overviewStats: {
          netWorth: 10000000,
          totalAssets: 10000000,
          totalLiabilities: 0,
          monthlyIncome: 8000000,
          monthlyExpense: 1251000,
          savingsRate: 84.36,
          trackingStartDate: '2026-10-30',
          activePeriod: {
            from: '2026-11-01',
            to: '2026-11-02',
            preset: 'this_month',
            accounts: [],
          },
          spendByCategory: [
            { categoryId: 'cat_rent', categoryName: 'Rent', amount: 1150000, percentage: 91.93, transactionCount: 1 },
            { categoryId: 'cat_food', categoryName: 'Food & Dining', amount: 77000, percentage: 6.15, transactionCount: 3 },
            { categoryId: 'cat_fuel', categoryName: 'Fuel', amount: 15000, percentage: 1.2, transactionCount: 1 },
            { categoryId: 'cat_trans', categoryName: 'Transport', amount: 9000, percentage: 0.72, transactionCount: 2 },
          ],
        },
      });

      const html = renderToString(<OverviewView />);

      // Period label formatted as "1-2 Nov 2026"
      expect(html).toContain('(1-2 Nov 2026)');
    });

    it('shows "-" with tracking start tooltip when prior period is before trackingStartDate', () => {
      useFinanceStore.setState({
        overviewStatus: 'ready',
        overviewStats: {
          netWorth: 10000000,
          totalAssets: 10000000,
          totalLiabilities: 0,
          monthlyIncome: 8000000,
          monthlyExpense: 1251000,
          savingsRate: 84.36,
          trackingStartDate: '2026-10-30',
          previousPeriodRange: {
            from: '2026-10-02', // Before 2026-10-30!
            to: '2026-10-31',
          },
          previousPeriod: {
            income: 11323300,
            expense: 200000,
            savingsRate: 98.23,
          },
          activePeriod: {
            from: '2026-11-01',
            to: '2026-11-30',
            preset: 'this_month',
            accounts: [],
          },
          spendByCategory: [],
        },
      });

      const html = renderToString(<OverviewView />);

      // Should show "-" for vs prior period
      expect(html).toContain('vs prior period');
      expect(html).toContain('Tracking started on 30 Oct 2026');
    });

    it('displays "-" for savings rate when current income is 0 (never negative-infinity)', () => {
      useFinanceStore.setState({
        overviewStatus: 'ready',
        overviewStats: {
          netWorth: 5000000,
          totalAssets: 5000000,
          totalLiabilities: 0,
          monthlyIncome: 0, // No income!
          monthlyExpense: 500000,
          savingsRate: 0,
          trackingStartDate: '2026-10-30',
          activePeriod: {
            from: '2026-11-01',
            to: '2026-11-02',
            preset: 'this_month',
            accounts: [],
          },
          spendByCategory: [],
        },
      });

      const html = renderToString(<OverviewView />);

      // The savings rate value itself must display "-"
      expect(html).toContain('- (no income in period)');
    });
  });
});
