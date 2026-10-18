"use client";

import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Trash2Icon, CheckIcon } from "lucide-react";
import type { SelectStep } from "@src/lib/query-engine/definition";
import type { ColumnInfo } from "@src/lib/connectors/types";

interface SelectFormProps {
  step: SelectStep;
  availableColumns: ColumnInfo[];
  onChange: (updated: Partial<SelectStep>) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function SelectForm({
  step,
  availableColumns,
  onChange,
  onRemove,
  onClose,
}: SelectFormProps) {
  const selectedCols = new Set(step.columns);

  const toggleColumn = (colName: string) => {
    let nextCols: string[];
    if (selectedCols.has(colName)) {
      if (step.columns.length <= 1) return; // keep at least 1
      nextCols = step.columns.filter((c) => c !== colName);
    } else {
      nextCols = [...step.columns, colName];
    }
    onChange({ columns: nextCols });
  };

  const selectAll = () => {
    onChange({ columns: availableColumns.map((c) => c.name) });
  };

  const deselectAll = () => {
    if (availableColumns.length > 0) {
      onChange({ columns: [availableColumns[0].name] });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">
          {step.columns.length} of {availableColumns.length} columns selected
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={selectAll}
            className="h-6 px-1.5 text-[11px]"
          >
            Select all
          </Button>
          <span className="text-muted-foreground/40">•</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={deselectAll}
            className="h-6 px-1.5 text-[11px]"
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="max-h-56 overflow-y-auto space-y-1 rounded-md border p-2 bg-muted/10">
        {availableColumns.map((col) => {
          const isChecked = selectedCols.has(col.name);
          return (
            <label
              key={col.name}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-xs"
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={() => toggleColumn(col.name)}
              />
              <span className="font-mono text-xs flex-1 truncate">
                {col.name}
              </span>
              <span className="text-[10px] text-muted-foreground uppercase font-mono">
                {col.type}
              </span>
            </label>
          );
        })}
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

