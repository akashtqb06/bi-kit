"use client";

import React from "react";
import { PlusIcon, Trash2Icon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FilterStep, FilterItem, FilterOp } from "@src/lib/query-engine/definition";
import type { ColumnInfo } from "@src/lib/connectors/types";

const OPERATOR_LABELS: Record<FilterOp, string> = {
  "=": "equals (=)",
  "!=": "not equals (!=)",
  ">": "greater than (>)",
  ">=": "greater or equal (>=)",
  "<": "less than (<)",
  "<=": "less or equal (<=)",
  contains: "contains",
  "starts with": "starts with",
  in: "in list",
  "not in": "not in list",
  between: "between",
  "is null": "is null",
  "is not null": "is not null",
};

interface FilterFormProps {
  step: FilterStep;
  availableColumns: ColumnInfo[];
  onChange: (updated: Partial<FilterStep>) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function FilterForm({
  step,
  availableColumns,
  onChange,
  onRemove,
  onClose,
}: FilterFormProps) {
  const { logic, items } = step.conditions;

  const toggleLogic = () => {
    onChange({
      conditions: {
        ...step.conditions,
        logic: logic === "and" ? "or" : "and",
      },
    });
  };

  const handleUpdateItem = (index: number, partial: Partial<FilterItem>) => {
    const updatedItems = items.map((item, i) => {
      if (i !== index) return item;
      return { ...item, ...partial };
    });
    onChange({
      conditions: {
        ...step.conditions,
        items: updatedItems,
      },
    });
  };

  const handleAddItem = () => {
    const firstCol = availableColumns[0]?.name || "id";
    const newItem: FilterItem = {
      column: firstCol,
      op: "=",
      value: "",
    };
    onChange({
      conditions: {
        ...step.conditions,
        items: [...items, newItem],
      },
    });
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    const updatedItems = items.filter((_, i) => i !== index);
    onChange({
      conditions: {
        ...step.conditions,
        items: updatedItems,
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Logic toggle */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground font-medium">Match</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggleLogic}
          className="h-6 px-2 text-[11px] font-semibold uppercase tracking-wider"
        >
          {logic}
        </Button>
        <span className="text-muted-foreground">of the following conditions:</span>
      </div>

      {/* Conditions list */}
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {items.map((item, index) => {
          const colInfo = availableColumns.find(
            (c) => c.name.toLowerCase() === item.column.toLowerCase()
          );
          const isNumeric =
            colInfo?.type.toLowerCase().includes("int") ||
            colInfo?.type.toLowerCase().includes("real") ||
            colInfo?.type.toLowerCase().includes("num");

          const isNullOp = item.op === "is null" || item.op === "is not null";
          const isBetween = item.op === "between";
          const isInList = item.op === "in" || item.op === "not in";

          return (
            <div
              key={index}
              className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-2 text-xs"
            >
              <div className="flex items-center gap-2">
                {/* Column picker */}
                <Select
                  value={item.column}
                  items={availableColumns.map((c) => ({ value: c.name, label: c.name }))}
                  onValueChange={(col) => {
                    if (col) handleUpdateItem(index, { column: col });
                  }}
                >
                  <SelectTrigger className="h-8 flex-1 text-xs font-mono">
                    <SelectValue placeholder="Column" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableColumns.map((c) => (
                      <SelectItem key={c.name} value={c.name} className="text-xs font-mono">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Operator */}
                <Select
                  value={item.op}
                  items={(Object.keys(OPERATOR_LABELS) as FilterOp[]).map((op) => ({
                    value: op,
                    label: OPERATOR_LABELS[op],
                  }))}
                  onValueChange={(op) => {
                    if (!op) return;
                    const newOp = op as FilterOp;
                    let newVal = item.value;
                    if (newOp === "between" && !Array.isArray(item.value)) {
                      newVal = [0, 100];
                    } else if (
                      (newOp === "in" || newOp === "not in") &&
                      !Array.isArray(item.value)
                    ) {
                      newVal = item.value ? [item.value] : [];
                    }
                    handleUpdateItem(index, { op: newOp, value: newVal });
                  }}
                >
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(OPERATOR_LABELS) as FilterOp[]).map((op) => (
                      <SelectItem key={op} value={op} className="text-xs">
                        {OPERATOR_LABELS[op]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Remove button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleRemoveItem(index)}
                  disabled={items.length <= 1}
                  className="size-7 text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>

              {/* Value Input(s) */}
              {!isNullOp && isBetween && (
                <div className="flex items-center gap-1.5">
                  <Input
                    type={isNumeric ? "number" : "text"}
                    placeholder="Min"
                    className="h-8 text-xs font-mono flex-1"
                    value={
                      Array.isArray(item.value) ? String(item.value[0] ?? "") : ""
                    }
                    onChange={(e) => {
                      const val0 = isNumeric
                        ? Number(e.target.value) || 0
                        : e.target.value;
                      const val1 = Array.isArray(item.value) ? item.value[1] : 0;
                      handleUpdateItem(index, { value: [val0, val1] });
                    }}
                  />
                  <span className="text-muted-foreground text-xs">to</span>
                  <Input
                    type={isNumeric ? "number" : "text"}
                    placeholder="Max"
                    className="h-8 text-xs font-mono flex-1"
                    value={
                      Array.isArray(item.value) ? String(item.value[1] ?? "") : ""
                    }
                    onChange={(e) => {
                      const val0 = Array.isArray(item.value) ? item.value[0] : 0;
                      const val1 = isNumeric
                        ? Number(e.target.value) || 0
                        : e.target.value;
                      handleUpdateItem(index, { value: [val0, val1] });
                    }}
                  />
                </div>
              )}

              {!isNullOp && isInList && (
                <Input
                  type="text"
                  placeholder="val1, val2, val3..."
                  className="h-8 text-xs font-mono"
                  value={
                    Array.isArray(item.value)
                      ? item.value.join(", ")
                      : String(item.value || "")
                  }
                  onChange={(e) => {
                    const rawList = e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    const parsed = isNumeric
                      ? rawList.map((s) => (isNaN(Number(s)) ? s : Number(s)))
                      : rawList;
                    handleUpdateItem(index, { value: parsed });
                  }}
                />
              )}

              {!isNullOp && !isBetween && !isInList && (
                <Input
                  type={isNumeric ? "number" : "text"}
                  placeholder="Value..."
                  className="h-8 text-xs font-mono"
                  value={item.value !== undefined ? String(item.value) : ""}
                  onChange={(e) => {
                    const val = isNumeric
                      ? e.target.value === ""
                        ? ""
                        : Number(e.target.value)
                      : e.target.value;
                    handleUpdateItem(index, { value: val });
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAddItem}
        className="h-7 text-xs font-normal border-dashed w-full"
      >
        <PlusIcon className="mr-1 size-3" />
        Add condition
      </Button>

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
