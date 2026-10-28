"use client";

import React, { useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  PlusIcon,
  DatabaseIcon,
  CheckSquareIcon,
  FilterIcon,
  GitMergeIcon,
  RowsIcon,
  CalculatorIcon,
  SigmaIcon,
  Grid3X3Icon,
  CodeIcon,
  RefreshCwIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type OperationType =
  | "source"
  | "select"
  | "filter"
  | "join"
  | "append"
  | "mutate"
  | "convert"
  | "summarize"
  | "pivot"
  | "custom";

interface OperationOption {
  type: OperationType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  disabledReason?: string;
  comingSoon?: boolean;
}

interface AddOperationPopoverProps {
  hasSource: boolean;
  supportedOperations?: string[];
  onSelectOperation: (type: OperationType) => void;
}

export function AddOperationPopover({
  hasSource,
  supportedOperations,
  onSelectOperation,
}: AddOperationPopoverProps) {
  const [open, setOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const isOpSupported = (opName: string): boolean => {
    if (!supportedOperations) return true;
    return supportedOperations.includes(opName);
  };

  const options: OperationOption[] = [
    {
      type: "source",
      title: "Select Source",
      description: "Select a table or collection to start your query",
      icon: DatabaseIcon,
      disabled: hasSource,
      disabledReason: hasSource ? "Source is already selected" : undefined,
    },
    {
      type: "select",
      title: "Choose Columns",
      description: "Show or hide columns from the table",
      icon: CheckSquareIcon,
      disabled: !hasSource || !isOpSupported("select"),
      disabledReason: !hasSource ? "Select a source first" : !isOpSupported("select") ? "Not supported by this data source" : undefined,
    },
    {
      type: "filter",
      title: "Filter Rows",
      description: "Filter rows based on columns or expressions",
      icon: FilterIcon,
      disabled: !hasSource || !isOpSupported("filter"),
      disabledReason: !hasSource ? "Select a source first" : !isOpSupported("filter") ? "Not supported by this data source" : undefined,
    },
    {
      type: "join",
      title: "Join Table",
      description: "Join this table with another table or query",
      icon: GitMergeIcon,
      disabled: !hasSource || !isOpSupported("join"),
      disabledReason: !hasSource ? "Select a source first" : !isOpSupported("join") ? "Not supported by this data source" : undefined,
    },
    {
      type: "append",
      title: "Append Table",
      description: "Append this table with another table or query",
      icon: RowsIcon,
      disabled: true,
      disabledReason: "Coming soon",
      comingSoon: true,
    },
    {
      type: "mutate",
      title: "Add New Column",
      description: "Add a new column based on existing columns",
      icon: CalculatorIcon,
      disabled: !hasSource || !isOpSupported("mutate"),
      disabledReason: !hasSource ? "Select a source first" : !isOpSupported("mutate") ? "Not supported by this data source" : undefined,
    },
    {
      type: "convert",
      title: "Convert Type",
      description: "Cast column to Datetime, Integer, Decimal, or Text",
      icon: RefreshCwIcon,
      disabled: !hasSource || !isOpSupported("mutate"),
      disabledReason: !hasSource ? "Select a source first" : !isOpSupported("mutate") ? "Not supported by this data source" : undefined,
    },
    {
      type: "summarize",
      title: "Group & Summarize",
      description: "Group rows by columns and summarize the data",
      icon: SigmaIcon,
      disabled: !hasSource || !isOpSupported("summarize"),
      disabledReason: !hasSource ? "Select a source first" : !isOpSupported("summarize") ? "Not supported by this data source" : undefined,
    },
    {
      type: "pivot",
      title: "Pivot",
      description: "Spreading column values into separate columns",
      icon: Grid3X3Icon,
      disabled: true,
      disabledReason: "Coming soon",
      comingSoon: true,
    },
    {
      type: "custom",
      title: "Custom SQL / Pipeline",
      description: "Switch to raw query editor mode",
      icon: CodeIcon,
      disabled: false,
    },
  ];

  const handleSelect = (op: OperationOption) => {
    if (op.disabled) return;
    setOpen(false);
    onSelectOperation(op.type);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const focusable = gridRef.current?.querySelectorAll<HTMLButtonElement>(
      "button:not([disabled])"
    );
    if (!focusable || focusable.length === 0) return;

    const currentIdx = Array.from(focusable).indexOf(
      document.activeElement as HTMLButtonElement
    );

    if (e.key === "ArrowRight") {
      e.preventDefault();
      const nextIdx = (currentIdx + 1) % focusable.length;
      focusable[nextIdx]?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prevIdx = (currentIdx - 1 + focusable.length) % focusable.length;
      focusable[prevIdx]?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIdx = (currentIdx + 2) % focusable.length;
      focusable[nextIdx]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIdx = (currentIdx - 2 + focusable.length) % focusable.length;
      focusable[prevIdx]?.focus();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs font-medium justify-center gap-1.5 border-dashed hover:border-foreground/30 hover:bg-muted/50"
          />
        }
      >
        <PlusIcon className="size-3.5" />
        Add Operation
      </PopoverTrigger>

      <PopoverContent
        side="left"
        align="start"
        sideOffset={8}
        className="w-[420px] p-3 shadow-lg"
      >
        <div className="space-y-2.5">
          <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Select an operation
          </h4>

          <div
            ref={gridRef}
            onKeyDown={handleKeyDown}
            className="grid grid-cols-2 gap-2"
          >
            {options.map((op) => {
              const Icon = op.icon;
              const buttonNode = (
                <button
                  type="button"
                  disabled={op.disabled}
                  onClick={() => handleSelect(op)}
                  className={cn(
                    "flex flex-col text-left p-2.5 rounded-lg border transition-all select-none group w-full",
                    op.disabled
                      ? "opacity-45 bg-muted/20 border-border cursor-not-allowed"
                      : "bg-card hover:bg-accent/60 hover:border-foreground/20 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                >
                  <div className="flex items-center justify-between gap-1.5 w-full mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={cn(
                          "size-6 rounded border flex items-center justify-center shrink-0",
                          op.disabled
                            ? "bg-muted text-muted-foreground/50 border-border"
                            : "bg-muted/50 text-foreground group-hover:bg-background border-border"
                        )}
                      >
                        <Icon className="size-3.5" />
                      </div>
                      <span className="font-semibold text-xs text-foreground truncate">
                        {op.title}
                      </span>
                    </div>

                    {op.comingSoon && (
                      <Badge
                        variant="secondary"
                        className="text-[9px] px-1 py-0 h-4 font-normal"
                      >
                        Soon
                      </Badge>
                    )}
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                    {op.description}
                  </p>
                </button>
              );

              if (op.disabled && op.disabledReason) {
                return (
                  <Tooltip key={op.type}>
                    <TooltipTrigger render={<div className="w-full cursor-not-allowed">{buttonNode}</div>} />
                    <TooltipContent side="top" className="text-xs">
                      {op.disabledReason}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return <React.Fragment key={op.type}>{buttonNode}</React.Fragment>;
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
