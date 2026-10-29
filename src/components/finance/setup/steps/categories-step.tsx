'use client';

import React, { useState } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  Trash2Icon,
  CheckIcon,
  TagsIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
} from '@src/lib/finance/constants';
import type { SetupCategories } from '@src/lib/finance/setup/types';

interface CategoriesStepProps {
  categories: SetupCategories;
  onChange: (updatedCategories: SetupCategories) => void;
  onNext: () => void;
  onBack: () => void;
}

export function CategoriesStep({
  categories,
  onChange,
  onNext,
  onBack,
}: CategoriesStepProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<'expense' | 'income'>('expense');

  const disabledSet = new Set(categories.disabledDefaults);

  const toggleDefaultCategory = (name: string) => {
    if (disabledSet.has(name)) {
      onChange({
        ...categories,
        disabledDefaults: categories.disabledDefaults.filter((d) => d !== name),
      });
    } else {
      onChange({
        ...categories,
        disabledDefaults: [...categories.disabledDefaults, name],
      });
    }
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newCatName.trim();
    if (!cleanName) return;

    onChange({
      ...categories,
      customCategories: [
        ...categories.customCategories,
        { name: cleanName, type: newCatType },
      ],
    });
    setNewCatName('');
  };

  const handleRemoveCustom = (index: number) => {
    onChange({
      ...categories,
      customCategories: categories.customCategories.filter((_, i) => i !== index),
    });
  };

  const totalDefaults =
    DEFAULT_EXPENSE_CATEGORIES.length + DEFAULT_INCOME_CATEGORIES.length;
  const enabledCount =
    totalDefaults - categories.disabledDefaults.length + categories.customCategories.length;

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center sm:text-left">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Categories (Optional)
        </h2>
        <p className="text-xs text-muted-foreground">
          We have pre-configured 21 standard Indian spending and income categories. You can review them, toggle off any you do not need, or add custom ones.
        </p>
      </div>

      {/* Collapsible Card */}
      <div className="border rounded-xl bg-card overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <TagsIcon className="size-3.5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                <span>Manage Categories</span>
                <Badge variant="secondary" className="text-[10px] font-mono">
                  {enabledCount} Active
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {isOpen ? 'Click to collapse' : 'Click to customize spending & income tags'}
              </p>
            </div>
          </div>

          <div className="text-muted-foreground">
            {isOpen ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
          </div>
        </button>

        {isOpen && (
          <div className="p-4 pt-2 border-t space-y-6">
            {/* Custom Category Form */}
            <form onSubmit={handleAddCustom} className="p-3 rounded-lg bg-muted/40 border space-y-2.5">
              <span className="text-xs font-semibold text-foreground">Add Custom Category</span>
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <Input
                  placeholder="e.g. Pets, Domestic Help, Freelance"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="text-xs flex-1"
                />
                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                  <Button
                    type="button"
                    variant={newCatType === 'expense' ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 text-xs flex-1 sm:flex-initial"
                    onClick={() => setNewCatType('expense')}
                  >
                    Expense
                  </Button>
                  <Button
                    type="button"
                    variant={newCatType === 'income' ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 text-xs flex-1 sm:flex-initial"
                    onClick={() => setNewCatType('income')}
                  >
                    Income
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8 text-xs font-semibold shrink-0"
                    disabled={!newCatName.trim()}
                  >
                    <PlusIcon className="size-3.5 mr-1" />
                    <span>Add</span>
                  </Button>
                </div>
              </div>
            </form>

            {/* Custom Categories Added */}
            {categories.customCategories.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-foreground">
                  Custom Categories ({categories.customCategories.length})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {categories.customCategories.map((cat, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="text-xs py-1 px-2.5 flex items-center gap-1.5"
                    >
                      <span className="font-medium">{cat.name}</span>
                      <span className="text-[10px] text-muted-foreground uppercase">
                        ({cat.type})
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCustom(i)}
                        className="hover:text-destructive ml-1"
                        title="Remove"
                      >
                        <Trash2Icon className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Expense Categories Grid */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-foreground">
                Default Expense Categories ({DEFAULT_EXPENSE_CATEGORIES.length})
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {DEFAULT_EXPENSE_CATEGORIES.map((cat) => {
                  const isEnabled = !disabledSet.has(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleDefaultCategory(cat)}
                      className={`px-3 py-2 rounded-lg border text-xs text-left flex items-center justify-between transition-colors ${
                        isEnabled
                          ? 'bg-card border-primary/30 text-foreground font-medium'
                          : 'bg-muted/20 border-transparent text-muted-foreground opacity-60 line-through'
                      }`}
                    >
                      <span className="truncate">{cat}</span>
                      {isEnabled && <CheckIcon className="size-3 text-primary shrink-0 ml-1.5" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Income Categories Grid */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-foreground">
                Default Income Categories ({DEFAULT_INCOME_CATEGORIES.length})
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {DEFAULT_INCOME_CATEGORIES.map((cat) => {
                  const isEnabled = !disabledSet.has(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleDefaultCategory(cat)}
                      className={`px-3 py-2 rounded-lg border text-xs text-left flex items-center justify-between transition-colors ${
                        isEnabled
                          ? 'bg-card border-emerald-500/30 text-foreground font-medium'
                          : 'bg-muted/20 border-transparent text-muted-foreground opacity-60 line-through'
                      }`}
                    >
                      <span className="truncate">{cat}</span>
                      {isEnabled && <CheckIcon className="size-3 text-emerald-500 shrink-0 ml-1.5" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={onBack}
        >
          Back
        </Button>

        <Button
          type="button"
          size="sm"
          className="text-xs font-semibold min-w-[120px]"
          onClick={onNext}
        >
          Review & Complete
        </Button>
      </div>
    </div>
  );
}
