"use client";

import React from "react";
import { Trash2Icon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MutateStep } from "@src/lib/query-engine/definition";
import type { ColumnInfo } from "@src/lib/connectors/types";

interface MutateFormProps {
  step: MutateStep;
  availableColumns: ColumnInfo[];
  onChange: (updated: Partial<MutateStep>) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function MutateForm({
  step,
  availableColumns,
  onChange,
  onRemove,
  onClose,
}: MutateFormProps) {
  const insertColumn = (colName: string) => {
    const expr = step.expression ? `${step.expression} "${colName}"` : `"${colName}"`;
    onChange({ expression: expr });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Column Name
        </label>
        <Input
          value={step.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="new_column_name"
          className="h-8 text-xs font-mono"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          SQL Expression
        </label>
        <Input
          value={step.expression}
          onChange={(e) => onChange({ expression: e.target.value })}
          placeholder='e.g. price * quantity or UPPER("name")'
          className="h-8 text-xs font-mono"
        />
        <p className="text-[10px] text-muted-foreground">
          Use valid SQLite scalar expressions.
        </p>
      </div>

      {/* Available column chips for quick click-to-insert */}
      {availableColumns.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase font-medium">
            Insert Column:
          </span>
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-1">
            {availableColumns.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => insertColumn(c.name)}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted hover:bg-muted/80 text-foreground border border-border"
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

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

