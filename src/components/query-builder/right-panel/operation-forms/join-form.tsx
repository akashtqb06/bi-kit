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
import type { JoinStep } from "@src/lib/query-engine/definition";
import type { ColumnInfo, SchemaInfo } from "@src/lib/connectors/types";

interface JoinFormProps {
  step: JoinStep;
  availableColumns: ColumnInfo[];
  schema: SchemaInfo | null;
  onChange: (updated: Partial<JoinStep>) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function JoinForm({
  step,
  availableColumns,
  schema,
  onChange,
  onRemove,
  onClose,
}: JoinFormProps) {
  const tables = schema?.tables || [];
  const targetTableCols =
    tables.find((t) => t.name.toLowerCase() === step.table.toLowerCase())?.columns || [];

  const handleTableChange = (newTable: string | null) => {
    if (!newTable) return;
    const newTargetCols =
      tables.find((t) => t.name.toLowerCase() === newTable.toLowerCase())?.columns || [];
    const firstLeft = availableColumns[0]?.name || "id";
    const firstRight = newTargetCols[0]?.name || "id";

    onChange({
      table: newTable,
      on: [{ left: firstLeft, right: firstRight }],
    });
  };

  const handleUpdateCondition = (
    index: number,
    side: "left" | "right",
    val: string
  ) => {
    const updated = step.on.map((cond, i) => {
      if (i !== index) return cond;
      return { ...cond, [side]: val };
    });
    onChange({ on: updated });
  };

  const handleAddCondition = () => {
    const firstLeft = availableColumns[0]?.name || "id";
    const firstRight = targetTableCols[0]?.name || "id";
    onChange({
      on: [...step.on, { left: firstLeft, right: firstRight }],
    });
  };

  const handleRemoveCondition = (index: number) => {
    if (step.on.length <= 1) return;
    onChange({ on: step.on.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      {/* Join Type and Target Table */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground uppercase">
            Join Type
          </label>
          <Select
            value={step.joinType}
            items={[
              { value: 'inner', label: 'Inner Join' },
              { value: 'left', label: 'Left Join' },
            ]}
            onValueChange={(val) => {
              if (val) onChange({ joinType: val as "inner" | "left" });
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inner" className="text-xs">
                Inner Join
              </SelectItem>
              <SelectItem value="left" className="text-xs">
                Left Join
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground uppercase">
            Table
          </label>
          <Select
            value={step.table}
            items={tables.map((t) => ({ value: t.name, label: t.name }))}
            onValueChange={(val) => {
              if (val) handleTableChange(val);
            }}
          >
            <SelectTrigger className="h-8 text-xs font-mono">
              <SelectValue placeholder="Select table..." />
            </SelectTrigger>
            <SelectContent>
              {tables.map((t) => (
                <SelectItem key={t.name} value={t.name} className="text-xs font-mono">
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Join Conditions */}
      <div className="space-y-2">
        <label className="text-[11px] font-medium text-muted-foreground uppercase">
          Join Conditions
        </label>
        {step.on.map((cond, index) => (
          <div key={index} className="flex items-center gap-1.5 text-xs">
            {/* Left Col */}
            <Select
              value={cond.left}
              items={availableColumns.map((c) => ({ value: c.name, label: c.name }))}
              onValueChange={(val) => {
                if (val) handleUpdateCondition(index, "left", val);
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

            <span className="text-muted-foreground text-xs font-mono">=</span>

            {/* Right Col */}
            <Select
              value={cond.right}
              items={targetTableCols.map((c) => ({ value: c.name, label: c.name }))}
              onValueChange={(val) => {
                if (val) handleUpdateCondition(index, "right", val);
              }}
            >
              <SelectTrigger className="h-8 flex-1 text-xs font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targetTableCols.map((c) => (
                  <SelectItem key={c.name} value={c.name} className="text-xs font-mono">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => handleRemoveCondition(index)}
              disabled={step.on.length <= 1}
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
          onClick={handleAddCondition}
          className="h-7 text-xs font-normal border-dashed w-full"
        >
          <PlusIcon className="mr-1 size-3" />
          Add condition
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
