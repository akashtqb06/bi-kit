'use client';

import React, { useMemo, useState } from 'react';
import {
  PlusIcon,
  Trash2Icon,
  PencilIcon,
  CheckIcon,
} from 'lucide-react';
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
import {
  CATEGORY_PALETTE_16,
  getDeterministicCategoryColor,
  suggestUnusedCategoryColor,
} from '@src/lib/finance/colors';
import type { CategoryDTO } from '@src/lib/finance/contract';

export function CategoriesView() {
  const { categories, addCategory, updateCategory, deleteCategory } = useFinanceStore();

  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense');

  // Add Dialog State
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(CATEGORY_PALETTE_16[0]);
  const [icon, setIcon] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Dialog State
  const [editOpen, setEditOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryDTO | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string>(CATEGORY_PALETTE_16[0]);
  const [editIcon, setEditIcon] = useState('');
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.type === activeTab),
    [categories, activeTab]
  );

  const handleOpenAdd = () => {
    // Suggest an unused palette color
    const suggestedColor = suggestUnusedCategoryColor(categories.map((c) => c.color));
    setName('');
    setColor(suggestedColor);
    setIcon('');
    setAddOpen(true);
  };

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
        color: color.trim() || undefined,
        icon: icon.trim() || undefined,
      });
      toast.success(`Category "${name.trim()}" created`);
      setName('');
      setIcon('');
      setAddOpen(false);
    } catch {
      toast.error('Failed to create category');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (cat: CategoryDTO) => {
    setEditingCategory(cat);
    setEditName(cat.name);
    setEditColor(cat.color || getDeterministicCategoryColor(cat.name));
    setEditIcon(cat.icon || '');
    setEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    if (!editName.trim()) {
      toast.error('Category name is required');
      return;
    }

    try {
      setIsEditSubmitting(true);
      await updateCategory(editingCategory.id, {
        name: editName.trim(),
        color: editColor.trim() || undefined,
        icon: editIcon.trim() || undefined,
      });
      toast.success(`Category "${editName.trim()}" updated`);
      setEditOpen(false);
      setEditingCategory(null);
    } catch {
      toast.error('Failed to update category');
    } finally {
      setIsEditSubmitting(false);
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
          onClick={handleOpenAdd}
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
        {filteredCategories.map((cat) => {
          const displayColor = cat.color || getDeterministicCategoryColor(cat.name);

          return (
            <div
              key={cat.id}
              className="p-3 rounded-xl border bg-card flex items-center justify-between shadow-xs hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="size-3.5 rounded-full shrink-0 shadow-xs ring-1 ring-border"
                  style={{ backgroundColor: displayColor }}
                />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-foreground truncate flex items-center gap-1.5">
                    {cat.icon && (
                      <span className="text-xs shrink-0">{cat.icon}</span>
                    )}
                    <span className="truncate">{cat.name}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                    <span>{cat.isSystem ? 'System Default' : 'Custom Category'}</span>
                    <span className="font-mono text-[9px] opacity-75">{displayColor}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {cat.isSystem ? (
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">
                    Default
                  </Badge>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => handleOpenEdit(cat)}
                      title="Edit category"
                    >
                      <PencilIcon className="size-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(cat.id, cat.name)}
                      title="Delete category"
                    >
                      <Trash2Icon className="size-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Category Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              Add {activeTab === 'expense' ? 'Expense' : 'Income'} Category
            </DialogTitle>
            <DialogDescription className="text-xs">
              Create a custom category with a color swatch, hex value, and optional icon.
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
              <Label htmlFor="cat-icon" className="text-xs font-medium text-muted-foreground">
                Optional Icon (Emoji or Symbol)
              </Label>
              <Input
                id="cat-icon"
                placeholder="e.g. 🐶, 💻, 🏋️"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="h-9 text-xs bg-card"
              />
            </div>

            {/* 16-Color Swatch Palette & Hex Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">
                  Color Swatch Palette
                </Label>
                <div className="flex items-center gap-1.5">
                  <span
                    className="size-3.5 rounded-full ring-1 ring-border shrink-0 shadow-xs"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-[11px] font-mono font-medium text-foreground">
                    {color}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-8 gap-2 p-2 rounded-lg border bg-muted/20">
                {CATEGORY_PALETTE_16.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={cn(
                      'size-7 rounded-full transition-transform flex items-center justify-center text-white shadow-xs',
                      color.toLowerCase() === c.toLowerCase()
                        ? 'scale-110 ring-2 ring-primary ring-offset-2'
                        : 'hover:scale-105'
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                    title={c}
                  >
                    {color.toLowerCase() === c.toLowerCase() && (
                      <CheckIcon className="size-3.5 drop-shadow-xs" />
                    )}
                  </button>
                ))}
              </div>

              {/* Hex Input */}
              <div className="space-y-1">
                <Label htmlFor="cat-hex" className="text-[11px] font-medium text-muted-foreground">
                  Custom Hex Color Code
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="cat-hex"
                    placeholder="#3b82f6"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-8 text-xs font-mono bg-card"
                  />
                  <div
                    className="size-8 rounded-md shrink-0 border shadow-xs"
                    style={{ backgroundColor: color }}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Create Category'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Category Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Edit Category</DialogTitle>
            <DialogDescription className="text-xs">
              Update category name, icon, and visual color indicators.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdate} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-cat-name" className="text-xs font-medium text-muted-foreground">
                Category Name
              </Label>
              <Input
                id="edit-cat-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-9 text-xs bg-card"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-cat-icon" className="text-xs font-medium text-muted-foreground">
                Optional Icon (Emoji or Symbol)
              </Label>
              <Input
                id="edit-cat-icon"
                placeholder="e.g. 🐶, 💻, 🏋️"
                value={editIcon}
                onChange={(e) => setEditIcon(e.target.value)}
                className="h-9 text-xs bg-card"
              />
            </div>

            {/* 16-Color Swatch Palette & Hex Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">
                  Color Swatch Palette
                </Label>
                <div className="flex items-center gap-1.5">
                  <span
                    className="size-3.5 rounded-full ring-1 ring-border shrink-0 shadow-xs"
                    style={{ backgroundColor: editColor }}
                  />
                  <span className="text-[11px] font-mono font-medium text-foreground">
                    {editColor}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-8 gap-2 p-2 rounded-lg border bg-muted/20">
                {CATEGORY_PALETTE_16.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={cn(
                      'size-7 rounded-full transition-transform flex items-center justify-center text-white shadow-xs',
                      editColor.toLowerCase() === c.toLowerCase()
                        ? 'scale-110 ring-2 ring-primary ring-offset-2'
                        : 'hover:scale-105'
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => setEditColor(c)}
                    title={c}
                  >
                    {editColor.toLowerCase() === c.toLowerCase() && (
                      <CheckIcon className="size-3.5 drop-shadow-xs" />
                    )}
                  </button>
                ))}
              </div>

              {/* Hex Input */}
              <div className="space-y-1">
                <Label htmlFor="edit-cat-hex" className="text-[11px] font-medium text-muted-foreground">
                  Custom Hex Color Code
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="edit-cat-hex"
                    placeholder="#3b82f6"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="h-8 text-xs font-mono bg-card"
                  />
                  <div
                    className="size-8 rounded-md shrink-0 border shadow-xs"
                    style={{ backgroundColor: editColor }}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isEditSubmitting}>
                {isEditSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
