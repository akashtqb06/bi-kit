'use client';

import * as React from 'react';
import {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxClear,
  ComboboxPortal,
  ComboboxPositioner,
  ComboboxPopup,
  ComboboxList,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxEmpty,
} from '@/components/ui/combobox';
import { getDeterministicCategoryColor } from '@src/lib/finance/colors';
import { cn } from '@/lib/utils';
import type { CategoryDTO } from '@src/lib/finance/contract';
import { useFinanceStore } from './finance-store';

export interface CategoryOption {
  id: string;
  name: string;
  color: string;
  type?: 'expense' | 'income';
}

export interface CategoryComboboxProps {
  value?: string | null;
  onValueChange: (value: string) => void;
  categories?: CategoryDTO[];
  placeholder?: string;
  disabled?: boolean;
  includeAll?: boolean;
  allLabel?: string;
  includeUncategorized?: boolean;
  includeNone?: boolean;
  filterType?: 'expense' | 'income';
  className?: string;
  inputClassName?: string;
  id?: string;
  error?: boolean;
}

export function CategoryCombobox({
  value,
  onValueChange,
  categories: categoriesProp,
  placeholder = 'Select category...',
  disabled = false,
  includeAll = false,
  allLabel = 'All Categories',
  includeUncategorized = false,
  includeNone = false,
  filterType,
  className,
  inputClassName,
  id,
  error = false,
}: CategoryComboboxProps) {
  const storeCategories = useFinanceStore((s) => s.categories);
  const categories = categoriesProp ?? storeCategories ?? [];
  // Build category options list
  const options = React.useMemo<CategoryOption[]>(() => {
    let cats = categories;
    if (filterType) {
      cats = cats.filter((c) => c.type === filterType);
    }

    const list: CategoryOption[] = [];

    if (includeAll) {
      list.push({
        id: 'all',
        name: allLabel,
        color: '#64748b',
      });
    }

    if (includeUncategorized) {
      list.push({
        id: 'uncategorized',
        name: 'Uncategorized',
        color: '#94a3b8',
      });
    }

    if (includeNone) {
      list.push({
        id: '__none__',
        name: 'None / Uncategorized',
        color: '#94a3b8',
      });
    }

    for (const cat of cats) {
      list.push({
        id: cat.id,
        name: cat.name,
        color: cat.color || getDeterministicCategoryColor(cat.name),
        type: cat.type,
      });
    }

    return list;
  }, [categories, filterType, includeAll, includeUncategorized, includeNone]);

  // Find active selected option
  const selectedOption = React.useMemo(() => {
    if (!value || value === '') {
      return null;
    }
    return (
      options.find(
        (o) =>
          o.id === value ||
          (value === 'uncategorized' && (o.id === 'uncategorized' || o.id === '__uncategorized__')) ||
          (value === '__uncategorized__' && (o.id === 'uncategorized' || o.id === '__uncategorized__'))
      ) || null
    );
  }, [options, value]);

  const handleSelect = (option: CategoryOption | null) => {
    if (!option) {
      onValueChange('');
      return;
    }
    if (option.id === '__uncategorized__' || option.id === '__none__') {
      onValueChange('');
    } else {
      onValueChange(option.id);
    }
  };

  return (
    <Combobox<CategoryOption>
      items={options}
      value={selectedOption}
      onValueChange={handleSelect}
      disabled={disabled}
      itemToStringLabel={(item) => (item ? item.name : '')}
      itemToStringValue={(item) => (item ? item.id : '')}
      isItemEqualToValue={(a, b) => {
        if (!a || !b) return a === b;
        const bId = typeof b === 'string' ? b : b.id;
        return a.id === bId;
      }}
    >
      <ComboboxInputGroup
        id={id ? `${id}-group` : undefined}
        className={cn(
          'h-9 bg-card px-2.5 transition-colors',
          error && 'border-destructive ring-1 ring-destructive',
          className
        )}
      >
        {selectedOption && (
          <span
            data-testid="category-color-dot"
            className="size-2 rounded-full shrink-0 mr-2 ring-1 ring-border shadow-xs"
            style={{ backgroundColor: selectedOption.color }}
          />
        )}
        <ComboboxInput
          id={id}
          placeholder={placeholder}
          className={cn('text-xs text-foreground', inputClassName)}
        />
        {selectedOption && !disabled && (
          <ComboboxClear
            aria-label="Clear category selection"
            onClick={() => onValueChange('')}
          />
        )}
        <ComboboxTrigger aria-label="Open categories list" />
      </ComboboxInputGroup>

      <ComboboxPortal>
        <ComboboxPositioner
          side="bottom"
          align="start"
          sideOffset={4}
          className="isolate z-50"
        >
          <ComboboxPopup className="w-[var(--anchor-width)] max-h-[280px] overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 p-1">
            <ComboboxEmpty className="py-4 text-center text-xs text-muted-foreground">
              No categories found
            </ComboboxEmpty>
            <ComboboxList>
              {(item: CategoryOption) => (
                <ComboboxItem
                  key={item.id}
                  value={item}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-md cursor-pointer outline-none select-none hover:bg-accent data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                >
                  <span
                    className="size-2 rounded-full shrink-0 ring-1 ring-border shadow-xs"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate flex-1 font-medium">{item.name}</span>
                  {item.type && (
                    <span className="text-[10px] text-muted-foreground uppercase opacity-70 mr-1">
                      {item.type}
                    </span>
                  )}
                  <ComboboxItemIndicator>
                    <span className="text-primary font-bold">✓</span>
                  </ComboboxItemIndicator>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxPopup>
        </ComboboxPositioner>
      </ComboboxPortal>
    </Combobox>
  );
}
