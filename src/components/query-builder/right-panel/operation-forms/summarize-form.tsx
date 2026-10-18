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
import type {
  SummarizeStep,
  GroupByItem,
  AggregateItem,
  DateGrain,
  AggFn,
} from "@src/lib/query-engine/definition";
import type { ColumnInfo } from "@src/lib/connectors/types";

interface SummarizeFormProps {
  step: SummarizeStep;
  availableColumns: ColumnInfo[];
  onChange: (updated: Partial<SummarizeStep>) => void;
  onRemove: () => void;
  onClose: () => void;
}

const AGG_LABELS: Record<AggFn, string> = {
  count: "Count",
  sum: "Sum",
  avg: "Average",
  min: "Min",
  max: "Max",
  count_distinct: "Count Distinct",
};

const DATE_GRAINS: DateGrain[] = ["year", "month", "week", "day", "hour"];

export function SummarizeForm({
  step,
  availableColumns,
  onChange,
  onRemove,
  onClose,
}: SummarizeFormProps) {
  // GROUP BY handlers
  const handleAddGroupBy = () => {
    const firstCol = availableColumns[0]?.name || "id";
    const newItem: GroupByItem = { column: firstCol };
    onChange({ groupBy: [...step.groupBy, newItem] });
  };

  const handleUpdateGroupBy = (
    index: number,
    partial: Partial<GroupByItem>
  ) => {
    const updated = step.groupBy.map((gb, i) => {
      if (i !== index) return gb;
      return { ...gb, ...partial };
    });
    onChange({ groupBy: updated });
  };

  const handleRemoveGroupBy = (index: number) => {
    onChange({ groupBy: step.groupBy.filter((_, i) => i !== index) });
  };

  // AGGREGATE handlers
  const handleAddAggregate = () => {
    const firstCol = availableColumns[0]?.name || "id";
    const newItem: AggregateItem = {
      fn: "count",
      column: firstCol,
      alias: `${firstCol}_count`,
    };
    onChange({ aggregates: [...step.aggregates, newItem] });
  };

  const handleUpdateAggregate = (
    index: number,
    partial: Partial<AggregateItem>
  ) => {
    const updated = step.aggregates.map((agg, i) => {
      if (i !== index) return agg;
      const merged = { ...agg, ...partial };
      // auto-update alias if column/fn changed and alias matches old auto pattern
      if (partial.fn || partial.column) {
        if (!agg.alias || agg.alias === `${agg.column}_${agg.fn}`) {
          merged.alias = `${merged.column}_${merged.fn}`;
        }
      }
      return merged;
    });
    onChange({ aggregates: updated });
  };

  const handleRemoveAggregate = (index: number) => {
    if (step.aggregates.length <= 1) return;
    onChange({ aggregates: step.aggregates.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      {/* Group By Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Group By
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleAddGroupBy}
            className="h-6 px-1.5 text-[11px] gap-1"
          >
            <PlusIcon className="size-3" />
            Add column
          </Button>
        </div>

        {step.groupBy.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1">
            No group by columns (aggregates entire table)
          </p>
        ) : (
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {step.groupBy.map((gb, index) => {
              const colInfo = availableColumns.find((c) => c.name === gb.column);
              const isDate =
                colInfo?.type.toLowerCase().includes("date") ||
                colInfo?.type.toLowerCase().includes("time") ||
                gb.column.toLowerCase().includes("date") ||
                gb.column.toLowerCase().includes("time") ||
                gb.column.toLowerCase().includes("at");

              return (
                <div key={index} className="flex items-center gap-1.5 text-xs">
                  {/* Column */}
                  <Select
                    value={gb.column}
                    items={availableColumns.map((c) => ({ value: c.name, label: c.name }))}
                    onValueChange={(val) => {
                      if (val) handleUpdateGroupBy(index, { column: val });
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

                  {/* Date grain if applicable */}
                  {isDate && (
                    <Select
                      value={gb.dateGrain || "month"}
                      items={DATE_GRAINS.map((grain) => ({
                        value: grain,
                        label: grain.charAt(0).toUpperCase() + grain.slice(1),
                      }))}
                      onValueChange={(val) => {
                        if (val) {
                          handleUpdateGroupBy(index, {
                            dateGrain: val as DateGrain,
                          });
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 w-24 text-xs capitalize">
                        <SelectValue placeholder="Grain" />
                      </SelectTrigger>
                      <SelectContent>
                        {DATE_GRAINS.map((grain) => (
                          <SelectItem key={grain} value={grain} className="text-xs capitalize">
                            {grain}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleRemoveGroupBy(index)}
                    className="size-7 text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Aggregates Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Summarize / Aggregates
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleAddAggregate}
            className="h-6 px-1.5 text-[11px] gap-1"
          >
            <PlusIcon className="size-3" />
            Add aggregate
          </Button>
        </div>

        <div className="space-y-2 max-h-44 overflow-y-auto">
          {step.aggregates.map((agg, index) => (
            <div
              key={index}
              className="flex items-center gap-1.5 p-1.5 rounded-lg border bg-muted/20 text-xs"
            >
              {/* Function */}
              <Select
                value={agg.fn}
                items={(Object.keys(AGG_LABELS) as AggFn[]).map((fn) => ({
                  value: fn,
                  label: AGG_LABELS[fn],
                }))}
                onValueChange={(val) => {
                  if (val) handleUpdateAggregate(index, { fn: val as AggFn });
                }}
              >
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(AGG_LABELS) as AggFn[]).map((fn) => (
                    <SelectItem key={fn} value={fn} className="text-xs">
                      {AGG_LABELS[fn]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Column */}
              <Select
                value={agg.column}
                items={[
                  ...(agg.fn === "count" ? [{ value: "*", label: "* (all rows)" }] : []),
                  ...availableColumns.map((c) => ({ value: c.name, label: c.name })),
                ]}
                onValueChange={(val) => {
                  if (val) handleUpdateAggregate(index, { column: val });
                }}
              >
                <SelectTrigger className="h-8 flex-1 text-xs font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agg.fn === "count" && (
                    <SelectItem value="*" className="text-xs font-mono font-bold">
                      * (all rows)
                    </SelectItem>
                  )}
                  {availableColumns.map((c) => (
                    <SelectItem key={c.name} value={c.name} className="text-xs font-mono">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Alias */}
              <Input
                value={agg.alias}
                onChange={(e) =>
                  handleUpdateAggregate(index, { alias: e.target.value })
                }
                placeholder="alias"
                className="h-8 w-24 text-xs font-mono"
              />

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => handleRemoveAggregate(index)}
                disabled={step.aggregates.length <= 1}
                className="size-7 text-muted-foreground hover:text-destructive shrink-0"
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
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
