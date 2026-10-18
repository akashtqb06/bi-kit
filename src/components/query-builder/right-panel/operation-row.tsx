"use client";

import React, { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  GripVerticalIcon,
  DatabaseIcon,
  CheckSquareIcon,
  FilterIcon,
  GitMergeIcon,
  CalculatorIcon,
  SigmaIcon,
  ArrowUpDownIcon,
  GaugeIcon,
  RefreshCwIcon,
} from "lucide-react";
import { cn } from "cn";
import { OperationChip } from "../operation-chip";
import { SourceForm } from "./operation-forms/source-form";
import { SelectForm } from "./operation-forms/select-form";
import { FilterForm } from "./operation-forms/filter-form";
import { JoinForm } from "./operation-forms/join-form";
import { MutateForm } from "./operation-forms/mutate-form";
import { ConvertForm } from "./operation-forms/convert-form";
import { SummarizeForm } from "./operation-forms/summarize-form";
import { OrderForm } from "./operation-forms/order-form";
import { LimitForm } from "./operation-forms/limit-form";
import type { ClientQueryStep } from "../store";
import type {
  QueryStep,
  SelectStep,
  FilterStep,
  JoinStep,
  MutateStep,
  SummarizeStep,
  OrderStep,
  LimitStep,
} from "@src/lib/query-engine/definition";
import type { ColumnInfo, SchemaInfo } from "@src/lib/connectors/types";

export interface OperationRowProps {
  step?: ClientQueryStep;
  isSource?: boolean;
  sourceTable?: string;
  schema: SchemaInfo | null;
  availableColumns: ColumnInfo[];
  stepIndex?: number;
  onUpdateSource?: (table: string) => void;
  onUpdateStep?: (stepIndex: number, partial: Partial<QueryStep>) => void;
  onRemoveStep?: (stepIndex: number) => void;
}

const FILTER_OP_DISPLAY: Record<string, string> = {
  "=": "equals",
  "!=": "not equals",
  ">": "greater than",
  ">=": "greater or equal",
  "<": "less than",
  "<=": "less or equal",
  contains: "contains",
  "starts with": "starts with",
  in: "in",
  "not in": "not in",
  between: "between",
  "is null": "is null",
  "is not null": "is not null",
};

export function OperationRow({
  step,
  isSource,
  sourceTable,
  schema,
  availableColumns,
  stepIndex = 0,
  onUpdateSource,
  onUpdateStep,
  onRemoveStep,
}: OperationRowProps) {
  const [open, setOpen] = useState(false);

  // DnD Hook (only for non-source operations)
  const sortableId = step?._id || "source-step";
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId,
    disabled: isSource,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  // Determine Icon and Title
  let Icon = DatabaseIcon;
  let title = "Operation";
  let isConvert = false;

  if (isSource) {
    Icon = DatabaseIcon;
    title = "Select Source";
  } else if (step) {
    switch (step.type) {
      case "select":
        Icon = CheckSquareIcon;
        title = "Choose Columns";
        break;
      case "filter":
        Icon = FilterIcon;
        title = "Filter Rows";
        break;
      case "join":
        Icon = GitMergeIcon;
        title = "Join Table";
        break;
      case "mutate": {
        const isCast = /CAST\s*\(|datetime\s*\(/i.test(step.expression);
        if (isCast) {
          Icon = RefreshCwIcon;
          title = "Convert Type";
          isConvert = true;
        } else {
          Icon = CalculatorIcon;
          title = "Add New Column";
        }
        break;
      }
      case "summarize":
        Icon = SigmaIcon;
        title = "Group & Summarize";
        break;
      case "order":
        Icon = ArrowUpDownIcon;
        title = "Sort Rows";
        break;
      case "limit":
        Icon = GaugeIcon;
        title = "Limit Rows";
        break;
    }
  }

  // Render descriptive sentence with chips
  const renderSentence = () => {
    if (isSource) {
      return (
        <span className="text-xs text-foreground/90 leading-snug">
          Select <OperationChip>{sourceTable || "source"}</OperationChip> table
        </span>
      );
    }

    if (!step) return null;

    switch (step.type) {
      case "select": {
        const count = step.columns.length;
        if (count === 1) {
          return (
            <span className="text-xs text-foreground/90 leading-snug">
              Select <OperationChip>{step.columns[0]}</OperationChip>
            </span>
          );
        }
        return (
          <span className="text-xs text-foreground/90 leading-snug">
            Select <OperationChip>{count} columns</OperationChip>
          </span>
        );
      }

      case "join":
        return (
          <span className="text-xs text-foreground/90 leading-snug">
            <OperationChip>{step.joinType}</OperationChip> join{" "}
            <OperationChip>{step.table}</OperationChip> table
          </span>
        );

      case "mutate": {
        const dtMatch = step.expression.match(/datetime\s*\(\s*"?([^"]+)"?\s*\)/i);
        if (dtMatch) {
          return (
            <span className="text-xs text-foreground/90 leading-snug">
              Convert <OperationChip>{dtMatch[1]}</OperationChip> to{" "}
              <OperationChip>Datetime</OperationChip>
            </span>
          );
        }
        const castMatch = step.expression.match(
          /CAST\s*\(\s*"?([^"]+)"?\s+AS\s+([A-Z]+)\s*\)/i
        );
        if (castMatch) {
          const rawType = castMatch[2].toLowerCase();
          const targetType =
            rawType.includes("int")
              ? "Integer"
              : rawType.includes("real") || rawType.includes("dec")
              ? "Decimal"
              : "Text";
          return (
            <span className="text-xs text-foreground/90 leading-snug">
              Convert <OperationChip>{castMatch[1]}</OperationChip> to{" "}
              <OperationChip>{targetType}</OperationChip>
            </span>
          );
        }
        return (
          <span className="text-xs text-foreground/90 leading-snug">
            Calculate <OperationChip>{step.name}</OperationChip>
          </span>
        );
      }

      case "filter": {
        const items = step.conditions.items;
        if (items.length === 1) {
          const item = items[0];
          const opText = FILTER_OP_DISPLAY[item.op] || item.op;
          const valText =
            item.op === "is null" || item.op === "is not null"
              ? ""
              : Array.isArray(item.value)
              ? item.value.join(", ")
              : String(item.value ?? "");
          return (
            <span className="text-xs text-foreground/90 leading-snug">
              Filter <OperationChip>{item.column}</OperationChip> {opText}{" "}
              {valText ? <OperationChip>{valText}</OperationChip> : null}
            </span>
          );
        }
        return (
          <span className="text-xs text-foreground/90 leading-snug">
            Filter <OperationChip>{items.length} conditions</OperationChip>
          </span>
        );
      }

      case "summarize": {
        const groupChips = step.groupBy.map((gb, i) => (
          <React.Fragment key={i}>
            <OperationChip>
              {gb.dateGrain ? `${gb.column} (${gb.dateGrain})` : gb.column}
            </OperationChip>
          </React.Fragment>
        ));

        const aggChips = step.aggregates.map((agg, i) => (
          <React.Fragment key={i}>
            <OperationChip>{`${agg.fn} of ${agg.column}`}</OperationChip>
          </React.Fragment>
        ));

        return (
          <span className="text-xs text-foreground/90 leading-snug">
            {step.groupBy.length > 0 && <>Group by {groupChips} </>}
            summarize {aggChips}
          </span>
        );
      }

      case "order": {
        const items = step.items;
        return (
          <span className="text-xs text-foreground/90 leading-snug">
            Sort by{" "}
            {items.map((it, i) => (
              <React.Fragment key={i}>
                <OperationChip>{it.column}</OperationChip>{" "}
                <OperationChip>{it.dir}</OperationChip>
              </React.Fragment>
            ))}
          </span>
        );
      }

      case "limit":
        return (
          <span className="text-xs text-foreground/90 leading-snug">
            Limit to <OperationChip>{step.value} rows</OperationChip>
          </span>
        );
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex items-center gap-1.5 rounded-lg border bg-card p-2 text-left transition-colors hover:bg-accent/40",
        isDragging && "opacity-50 ring-2 ring-primary/40 z-20",
        open && "border-primary/50 bg-accent/30"
      )}
    >
      {/* Drag handle (hover only, not for source) */}
      {!isSource ? (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 group-hover:text-muted-foreground hover:bg-muted rounded transition-colors"
          title="Drag to reorder"
        >
          <GripVerticalIcon className="size-3.5" />
        </button>
      ) : (
        <div className="w-4 shrink-0" />
      )}

      {/* Popover anchored to this row */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          nativeButton={false}
          render={
            <div
              role="button"
              tabIndex={0}
              className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer select-none"
            />
          }
        >
          {/* Left: Small bordered icon box */}
          <div className="size-6 rounded border bg-muted/40 flex items-center justify-center shrink-0 text-muted-foreground group-hover:text-foreground group-hover:border-foreground/30 transition-colors">
            <Icon className="size-3.5" />
          </div>

          {/* Right: Sentence with code chips */}
          <div className="flex-1 min-w-0">{renderSentence()}</div>
        </PopoverTrigger>

        <PopoverContent
          side="left"
          align="start"
          sideOffset={8}
          className="w-[380px] p-4 shadow-xl z-50"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b">
              <div className="size-6 rounded border bg-muted/40 flex items-center justify-center shrink-0">
                <Icon className="size-3.5" />
              </div>
              <h4 className="font-semibold text-xs text-foreground">{title}</h4>
            </div>

            {/* Form rendering */}
            {isSource && (
              <SourceForm
                currentTable={sourceTable || ""}
                schema={schema}
                onSave={(newTable) => onUpdateSource?.(newTable)}
                onClose={() => setOpen(false)}
              />
            )}

            {!isSource && step && step.type === "select" && (
              <SelectForm
                step={step as SelectStep}
                availableColumns={availableColumns}
                onChange={(partial) => onUpdateStep?.(stepIndex, partial)}
                onRemove={() => {
                  onRemoveStep?.(stepIndex);
                  setOpen(false);
                }}
                onClose={() => setOpen(false)}
              />
            )}

            {!isSource && step && step.type === "filter" && (
              <FilterForm
                step={step as FilterStep}
                availableColumns={availableColumns}
                onChange={(partial) => onUpdateStep?.(stepIndex, partial)}
                onRemove={() => {
                  onRemoveStep?.(stepIndex);
                  setOpen(false);
                }}
                onClose={() => setOpen(false)}
              />
            )}

            {!isSource && step && step.type === "join" && (
              <JoinForm
                step={step as JoinStep}
                availableColumns={availableColumns}
                schema={schema}
                onChange={(partial) => onUpdateStep?.(stepIndex, partial)}
                onRemove={() => {
                  onRemoveStep?.(stepIndex);
                  setOpen(false);
                }}
                onClose={() => setOpen(false)}
              />
            )}

            {!isSource && step && step.type === "mutate" && (
              isConvert ? (
                <ConvertForm
                  step={step as MutateStep}
                  availableColumns={availableColumns}
                  onChange={(partial) => onUpdateStep?.(stepIndex, partial)}
                  onRemove={() => {
                    onRemoveStep?.(stepIndex);
                    setOpen(false);
                  }}
                  onClose={() => setOpen(false)}
                />
              ) : (
                <MutateForm
                  step={step as MutateStep}
                  availableColumns={availableColumns}
                  onChange={(partial) => onUpdateStep?.(stepIndex, partial)}
                  onRemove={() => {
                    onRemoveStep?.(stepIndex);
                    setOpen(false);
                  }}
                  onClose={() => setOpen(false)}
                />
              )
            )}

            {!isSource && step && step.type === "summarize" && (
              <SummarizeForm
                step={step as SummarizeStep}
                availableColumns={availableColumns}
                onChange={(partial) => onUpdateStep?.(stepIndex, partial)}
                onRemove={() => {
                  onRemoveStep?.(stepIndex);
                  setOpen(false);
                }}
                onClose={() => setOpen(false)}
              />
            )}

            {!isSource && step && step.type === "order" && (
              <OrderForm
                step={step as OrderStep}
                availableColumns={availableColumns}
                onChange={(partial) => onUpdateStep?.(stepIndex, partial)}
                onRemove={() => {
                  onRemoveStep?.(stepIndex);
                  setOpen(false);
                }}
                onClose={() => setOpen(false)}
              />
            )}

            {!isSource && step && step.type === "limit" && (
              <LimitForm
                step={step as LimitStep}
                onChange={(partial) => onUpdateStep?.(stepIndex, partial)}
                onRemove={() => {
                  onRemoveStep?.(stepIndex);
                  setOpen(false);
                }}
                onClose={() => setOpen(false)}
              />
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

