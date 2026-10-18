"use client";

import React, { useMemo } from "react";
import { Trash2Icon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MutateStep } from "@src/lib/query-engine/definition";
import type { ColumnInfo } from "@src/lib/connectors/types";

interface ConvertFormProps {
  step: MutateStep;
  availableColumns: ColumnInfo[];
  onChange: (updated: Partial<MutateStep>) => void;
  onRemove: () => void;
  onClose: () => void;
}

type TargetType = "Datetime" | "Integer" | "Decimal" | "Text";

function parseConvertExpression(
  expression: string,
  fallbackColumn: string
): { column: string; targetType: TargetType } {
  const dtMatch = expression.match(/datetime\s*\(\s*"?([^"]+)"?\s*\)/i);
  if (dtMatch) {
    return { column: dtMatch[1], targetType: "Datetime" };
  }

  const castMatch = expression.match(/CAST\s*\(\s*"?([^"]+)"?\s+AS\s+([A-Z]+)\s*\)/i);
  if (castMatch) {
    const col = castMatch[1];
    const sqlT = castMatch[2].toUpperCase();
    if (sqlT === "INTEGER" || sqlT === "INT") {
      return { column: col, targetType: "Integer" };
    }
    if (sqlT === "REAL" || sqlT === "DECIMAL" || sqlT === "NUMERIC") {
      return { column: col, targetType: "Decimal" };
    }
    return { column: col, targetType: "Text" };
  }

  return { column: fallbackColumn, targetType: "Integer" };
}

function buildConvertExpression(column: string, targetType: TargetType): string {
  switch (targetType) {
    case "Datetime":
      return `datetime("${column}")`;
    case "Integer":
      return `CAST("${column}" AS INTEGER)`;
    case "Decimal":
      return `CAST("${column}" AS REAL)`;
    case "Text":
      return `CAST("${column}" AS TEXT)`;
  }
}

export function ConvertForm({
  step,
  availableColumns,
  onChange,
  onRemove,
  onClose,
}: ConvertFormProps) {
  const firstCol = availableColumns[0]?.name || "id";
  const { column: parsedCol, targetType: parsedType } = useMemo(() => {
    return parseConvertExpression(step.expression || "", step.name || firstCol);
  }, [step.expression, step.name, firstCol]);

  const handleColumnChange = (newCol: string) => {
    const newExpr = buildConvertExpression(newCol, parsedType);
    onChange({ name: newCol, expression: newExpr });
  };

  const handleTypeChange = (newType: TargetType) => {
    const newExpr = buildConvertExpression(parsedCol, newType);
    onChange({ name: parsedCol, expression: newExpr });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          Column to Convert
        </label>
        <Select
          value={parsedCol}
          items={availableColumns.map((c) => ({
            value: c.name,
            label: `${c.name} (${c.type})`,
          }))}
          onValueChange={(val) => {
            if (val) handleColumnChange(val);
          }}
        >
          <SelectTrigger className="h-8 text-xs font-mono">
            <SelectValue placeholder="Select column..." />
          </SelectTrigger>
          <SelectContent>
            {availableColumns.map((c) => (
              <SelectItem key={c.name} value={c.name} className="text-xs font-mono">
                {c.name} ({c.type})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          Convert to Type
        </label>
        <Select
          value={parsedType}
          items={[
            { value: "Datetime", label: "Datetime (YYYY-MM-DD HH:MM:SS)" },
            { value: "Integer", label: "Integer (whole number)" },
            { value: "Decimal", label: "Decimal (floating point)" },
            { value: "Text", label: "Text (string)" },
          ]}
          onValueChange={(val) => {
            if (val) handleTypeChange(val as TargetType);
          }}
        >
          <SelectTrigger className="h-8 text-xs font-medium">
            <SelectValue placeholder="Select type..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Datetime" className="text-xs">
              Datetime (YYYY-MM-DD HH:MM:SS)
            </SelectItem>
            <SelectItem value="Integer" className="text-xs">
              Integer (whole number)
            </SelectItem>
            <SelectItem value="Decimal" className="text-xs">
              Decimal (floating point)
            </SelectItem>
            <SelectItem value="Text" className="text-xs">
              Text (string)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md bg-muted/40 p-2 border text-[11px] font-mono text-muted-foreground">
        Generated: <span className="text-foreground">{step.expression}</span>
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
