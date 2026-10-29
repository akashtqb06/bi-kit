'use client';

import React, { useMemo, useState } from 'react';
import { PlusIcon, Trash2Icon, CheckIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useFinanceStore } from './finance-store';
import { cn } from '@/lib/utils';

const COLOR_PRESETS = [
  '#f97316', // orange
  '#10b981', // emerald
  '#3b82f6', // blue
  '#ef4444', // red
  '#8b5cf6', // purple
  '#eab308', // yellow
  '#ec4899', // pink
  '#14b8a6', // teal
  '#6366f1', // indigo
  '#06b6d4', // cyan
];

export function CategoriesView() {
  const { categories, addCategory, deleteCategory } = useFinanceStore();

  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense');
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.type === activeTab),
    [categories, activeTab]
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Category name is required');
      return;
    }

    try {
      setIsSubmitting(true);
      await addCategory({
        name: name.trim(),
        type: activeTab,
        color,
      });
      toast.success(`Category "${name.trim()}" created`);
      setName('');
      setAddOpen(false);
    } catch {
      toast.error('Failed to create category');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, catName: string) => {
    if (confirm(`Delete category "${catName}"?`)) {
      await deleteCategory(id);
      toast.success('Category removed');
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-6 w-full pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Categories & Classification</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage spending categories, income sources, and system classifications
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          className="gap-1.5 text-xs font-semibold shadow-xs"
          onClick={() => setAddOpen(true)}
        >
          <PlusIcon className="size-3.5" />
          <span>Add Category</span>
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          type="button"
          className={cn(
            'px-4 py-2 text-xs font-semibold border-b-2 transition-colors -mb-px',
            activeTab === 'expense'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('expense')}
        >
          Expense Categories (
          {categories.filter((c) => c.type === 'expense').length})
        </button>
        <button
          type="button"
          className={cn(
            'px-4 py-2 text-xs font-semibold border-b-2 transition-colors -mb-px',
            activeTab === 'income'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('income')}
        >
          Income Categories ({categories.filter((c) => c.type === 'income').length})
        </button>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {filteredCategories.map((cat) => (
          <div
            key={cat.id}
            className="p-3 rounded-xl border bg-card flex items-center justify-between shadow-xs hover:border-primary/40 transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="size-3 rounded-full shrink-0 shadow-xs"
                style={{ backgroundColor: cat.color || '#94a3b8' }}
              />
              <div className="min-w-0">
                <div className="text-xs font-bold text-foreground truncate">
                  {cat.name}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {cat.isSystem ? 'System Default' : 'Custom Category'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {cat.isSystem ? (
                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">
                  Default
                </Badge>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(cat.id, cat.name)}
                  title="Delete category"
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Category Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              Add {activeTab === 'expense' ? 'Expense' : 'Income'} Category
            </DialogTitle>
            <DialogDescription className="text-xs">
              Create a custom category to tag transactions.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name" className="text-xs font-medium text-muted-foreground">
                Category Name
              </Label>
              <Input
                id="cat-name"
                placeholder="e.g. Pet Care, Software, Gym"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 text-xs bg-card"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Color Theme</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={cn(
                      'size-7 rounded-full transition-transform flex items-center justify-center text-white',
                      color === c ? 'scale-110 ring-2 ring-primary ring-offset-2' : 'hover:scale-105'
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  >
                    {color === c && <CheckIcon className="size-3.5" />}
                  </button>
                ))}
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Create Category'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
