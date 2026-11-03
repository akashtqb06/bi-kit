import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CategoryCombobox } from '../category-combobox';
import { useFinanceStore } from '../finance-store';

const mockCategories = [
  {
    id: 'cat_food',
    userId: 'usr_1',
    name: 'Food & Dining',
    type: 'expense' as const,
    parentId: null,
    icon: 'utensils',
    color: '#10b981',
    isSystem: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'cat_rent',
    userId: 'usr_1',
    name: 'Rent',
    type: 'expense' as const,
    parentId: null,
    icon: 'home',
    color: '#3b82f6',
    isSystem: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'cat_salary',
    userId: 'usr_1',
    name: 'Salary',
    type: 'income' as const,
    parentId: null,
    icon: 'wallet',
    color: '#22c55e',
    isSystem: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
];

describe('CategoryCombobox Component', () => {
  beforeEach(() => {
    useFinanceStore.setState({
      categories: mockCategories,
    });
  });

  it('renders input trigger with placeholder when no value selected', () => {
    const markup = renderToStaticMarkup(
      <CategoryCombobox value="" onValueChange={vi.fn()} placeholder="Select category..." />
    );
    expect(markup).toContain('placeholder="Select category..."');
  });

  it('displays category name and color indicator when value is set', () => {
    const markup = renderToStaticMarkup(
      <CategoryCombobox value="cat_rent" onValueChange={vi.fn()} />
    );
    // Should render input with value="Rent"
    expect(markup).toContain('value="Rent"');
    // Should render category color dot
    expect(markup).toContain('background-color:#3b82f6');
  });

  it('renders with includeAll option', () => {
    const markup = renderToStaticMarkup(
      <CategoryCombobox value="all" onValueChange={vi.fn()} includeAll allLabel="All Categories" />
    );
    expect(markup).toContain('value="All Categories"');
  });

  it('renders with includeUncategorized option', () => {
    const markup = renderToStaticMarkup(
      <CategoryCombobox value="uncategorized" onValueChange={vi.fn()} includeUncategorized />
    );
    expect(markup).toContain('value="Uncategorized"');
  });
});
