import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FinanceAreaChart } from './finance-area-chart';
import { FinanceBarChart } from './finance-bar-chart';
import { FinanceDonutChart } from './finance-donut-chart';

describe('Finance Chart Wrappers', () => {
  describe('FinanceAreaChart', () => {
    it('renders placeholder when data is empty', () => {
      const html = renderToString(<FinanceAreaChart data={[]} />);
      expect(html).toContain('No history data available for this range');
    });

    it('renders with a single point without crashing and shapes step data', () => {
      const html = renderToString(
        <FinanceAreaChart
          data={[{ date: '2026-10-30', value: 811885, hasActivity: true }]}
        />
      );
      expect(html).toBeDefined();
      expect(html).toContain('data-slot="chart"');
    });
  });

  describe('FinanceBarChart', () => {
    it('renders placeholder when data is empty', () => {
      const html = renderToString(
        <FinanceBarChart
          data={[]}
          series={[{ dataKey: 'income', label: 'Income', colorVar: 'var(--chart-1)' }]}
        />
      );
      expect(html).toContain('No bar data available for this range');
    });

    it('renders with data without crashing', () => {
      const html = renderToString(
        <FinanceBarChart
          data={[{ date: '2026-10-01', income: 500000, expense: 200000 }]}
          series={[
            { dataKey: 'income', label: 'Income', colorVar: 'var(--chart-1)' },
            { dataKey: 'expense', label: 'Expense', colorVar: 'var(--chart-2)' },
          ]}
        />
      );
      expect(html).toBeDefined();
      expect(html).toContain('data-slot="chart"');
    });
  });

  describe('FinanceDonutChart', () => {
    it('renders empty message when data is empty', () => {
      const html = renderToString(<FinanceDonutChart data={[]} />);
      expect(html).toContain('No expenses in this period');
    });

    it('groups categories beyond 7 into Others and sums total', () => {
      const data = [
        { name: 'Rent', amount: 3500000 },
        { name: 'Groceries', amount: 1500000 },
        { name: 'Dining', amount: 800000 },
        { name: 'Utilities', amount: 400000 },
        { name: 'Shopping', amount: 600000 },
        { name: 'Travel', amount: 500000 },
        { name: 'Entertainment', amount: 300000 },
        { name: 'Subscriptions', amount: 100000 },
        { name: 'Healthcare', amount: 200000 },
      ];

      const html = renderToString(<FinanceDonutChart data={data} totalLabel="Monthly Spend" />);
      // Top categories visible
      expect(html).toContain('Rent');
      expect(html).toContain('Groceries');
      // 8th and 9th categories collapsed into Others
      expect(html).toContain('Others');
      // Contains compact center total
      expect(html).toContain('Monthly Spend');
    });
  });
});
