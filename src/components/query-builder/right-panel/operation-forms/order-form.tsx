"use client";

import React from "react";
import { PlusIcon, Trash2Icon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrderStep } from "@src/lib/query-engine/definition";
import type { ColumnInfo } from "@src/lib/connectors/types";

interface OrderFormProps {
  step: OrderStep;
  availableColumns: ColumnInfo[];
  onChange: (updated: Partial<OrderStep>) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function OrderForm({
  step,
  availableColumns,
  onChange,
  onRemove,
  onClose,
}: OrderFormProps) {
  const handleAddItem = () => {
    const firstCol = availableColumns[0]?.name || "id";
    onChange({ items: [...step.items, { column: firstCol, dir: "asc" }] });
  };

  const handleUpdateItem = (
    index: number,
    partial: Partial<{ column: string; dir: "asc" | "desc" }>
  ) => {
    const updated = step.items.map((item, i) => {
      if (i !== index) return item;
      return { ...item, ...partial };
    });
    onChange({ items: updated });
  };

  const handleRemoveItem = (index: number) => {
    if (step.items.length <= 1) return;
    onChange({ items: step.items.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Sort Columns
        </label>
        {step.items.map((item, index) => (
          <div key={index} className="flex items-center gap-2 text-xs">
            <Select
              value={item.column}
              items={availableColumns.map((c) => ({ value: c.name, label: c.name }))}
              onValueChange={(val) => {
                if (val) handleUpdateItem(index, { column: val });
              }}
            >
              <SelectTrigger className="h-8 flex-1 text-xs font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableColumns.map((c) => (
                  <SelectItem key={c.name} value={c.name} className="text-xs font-mono">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={item.dir}
              items={[
                { value: 'asc', label: 'Asc (A-Z)' },
                { value: 'desc', label: 'Desc (Z-A)' },
              ]}
              onValueChange={(val) => {
                if (val) handleUpdateItem(index, { dir: val as "asc" | "desc" });
              }}
            >
              <SelectTrigger className="h-8 w-24 text-xs font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc" className="text-xs">
                  Asc (A-Z)
                </SelectItem>
                <SelectItem value="desc" className="text-xs">
                  Desc (Z-A)
                </SelectItem>
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => handleRemoveItem(index)}
              disabled={step.items.length <= 1}
              className="size-7 text-muted-foreground hover:text-destructive shrink-0"
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddItem}
          className="h-7 text-xs font-normal border-dashed w-full"
        >
          <PlusIcon className="mr-1 size-3" />
          Add sort column
        </Button>
      </div>

      <div className="flex items-center justify-between pt-2 border-t">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRemove}
          className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20 gap-1.5"
        >
          <Trash2Icon className="size-3.5" />
          Remove
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onClose}
          className="h-8 text-xs gap-1.5"
        >
          <CheckIcon className="size-3.5" />
          Save
        </Button>
      </div>
    </div>
  );
}
