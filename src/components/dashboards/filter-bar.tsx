"use client";

import React, { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import {
  CalendarIcon,
  ListFilterIcon,
  PlusIcon,
  XIcon,
  Trash2Icon,
  FilterIcon,
  CheckIcon,
} from "lucide-react";
import {
  format,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from "date-fns";
import type { DateRange } from "react-day-picker";
import type { DashboardFilter } from "@src/lib/schemas";
import { cn } from "@/lib/utils";

export interface FilterBarProps {
  filters: DashboardFilter[];
  filterValues: Record<string, unknown>;
  onFilterValueChange: (filterId: string, value: unknown) => void;
  onClearAll: () => void;
  isEditMode: boolean;
  onAddFilterClick: () => void;
  onRemoveFilter: (filterId: string) => void;
  distinctValuesMap?: Record<string, string[]>;
}

export function FilterBar({
  filters,
  filterValues,
  onFilterValueChange,
  onClearAll,
  isEditMode,
  onAddFilterClick,
  onRemoveFilter,
  distinctValuesMap = {},
}: FilterBarProps) {
  const hasActiveFilters = Object.values(filterValues).some(
    (v) => v !== undefined && v !== null && v !== "" && v !== "__all__"
  );

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b bg-muted/20 shrink-0 min-h-11">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mr-1">
        <FilterIcon className="size-3.5 text-primary" />
        <span>Filters</span>
      </div>

      {/* Render each configured dashboard filter */}
      {filters.map((filter) => {
        const val = filterValues[filter.id];

        if (filter.type === "date_range") {
          return (
            <DateRangeFilterChip
              key={filter.id}
              filter={filter}
              value={val as { from?: Date; to?: Date } | null}
              onChange={(next) => onFilterValueChange(filter.id, next)}
              isEditMode={isEditMode}
              onRemove={() => onRemoveFilter(filter.id)}
            />
          );
        }

        return (
          <SelectFilterChip
            key={filter.id}
            filter={filter}
            value={val as string | null}
            options={distinctValuesMap[filter.column] || []}
            onChange={(next) => onFilterValueChange(filter.id, next)}
            isEditMode={isEditMode}
            onRemove={() => onRemoveFilter(filter.id)}
          />
        );
      })}

      {/* Add filter button visible in edit mode */}
      {isEditMode && (
        <Button
          variant="outline"
          size="sm"
          onClick={onAddFilterClick}
          className="h-7 text-xs gap-1 border-dashed text-muted-foreground hover:text-foreground"
        >
          <PlusIcon className="size-3" />
          Add Filter
        </Button>
      )}

      {/* Clear all active values button */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAll}
          className="h-7 text-xs text-muted-foreground hover:text-foreground ml-auto gap-1"
        >
          <XIcon className="size-3" />
          Clear all
        </Button>
      )}

      {filters.length === 0 && !isEditMode && (
        <span className="text-xs text-muted-foreground/60 italic">
          No filters configured
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date Range Filter Chip
// ---------------------------------------------------------------------------

function DateRangeFilterChip({
  filter,
  value,
  onChange,
  isEditMode,
  onRemove,
}: {
  filter: DashboardFilter;
  value?: { from?: Date; to?: Date } | null;
  onChange: (val: { from?: Date; to?: Date } | null) => void;
  isEditMode: boolean;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  const hasValue = Boolean(value?.from || value?.to);

  // Format label text
  let labelText = "All time";
  if (value?.from && value?.to) {
    labelText = `${format(value.from, "MMM d")} - ${format(value.to, "MMM d, yyyy")}`;
  } else if (value?.from) {
    labelText = `From ${format(value.from, "MMM d, yyyy")}`;
  } else if (value?.to) {
    labelText = `Until ${format(value.to, "MMM d, yyyy")}`;
  }

  // Quick preset helper
  const applyPreset = (preset: "today" | "last7" | "last30" | "thisMonth" | "thisYear") => {
    const now = new Date();
    switch (preset) {
      case "today":
        onChange({ from: now, to: now });
        break;
      case "last7":
        onChange({ from: subDays(now, 7), to: now });
        break;
      case "last30":
        onChange({ from: subDays(now, 30), to: now });
        break;
      case "thisMonth":
        onChange({ from: startOfMonth(now), to: endOfMonth(now) });
        break;
      case "thisYear":
        onChange({ from: startOfYear(now), to: endOfYear(now) });
        break;
    }
    setOpen(false);
  };

  const dayPickerRange: DateRange | undefined = value?.from
    ? { from: value.from, to: value.to }
    : undefined;

  return (
    <div className="flex items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant={hasValue ? "secondary" : "outline"}
              size="sm"
              className={cn(
                "h-7 text-xs gap-1.5 font-normal px-2.5",
                hasValue && "border-primary/40 bg-primary/10 text-primary font-medium"
              )}
            />
          }
        >
          <CalendarIcon className="size-3 text-muted-foreground" />
          <span className="font-medium text-foreground">{filter.name}:</span>
          <span className="truncate max-w-44">{labelText}</span>
        </PopoverTrigger>

        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex flex-col">
            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-muted/20">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyPreset("last7")}
                className="h-6 text-[11px] px-2"
              >
                Last 7d
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyPreset("last30")}
                className="h-6 text-[11px] px-2"
              >
                Last 30d
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyPreset("thisMonth")}
                className="h-6 text-[11px] px-2"
              >
                This Month
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyPreset("thisYear")}
                className="h-6 text-[11px] px-2"
              >
                This Year
              </Button>
              {hasValue && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="h-6 text-[11px] px-2 text-destructive hover:text-destructive ml-auto"
                >
                  Clear
                </Button>
              )}
            </div>

            {/* Calendar */}
            <Calendar
              mode="range"
              selected={dayPickerRange}
              onSelect={(range) => {
                if (range) {
                  onChange({ from: range.from, to: range.to });
                } else {
                  onChange(null);
                }
              }}
              numberOfMonths={1}
            />
          </div>
        </PopoverContent>
      </Popover>

      {/* Clear active filter button */}
      {hasValue && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="size-5 rounded-full hover:bg-muted flex items-center justify-center -ml-1 text-muted-foreground hover:text-foreground"
          title="Clear date filter"
        >
          <XIcon className="size-3" />
        </button>
      )}

      {/* Remove filter definition in edit mode */}
      {isEditMode && (
        <button
          type="button"
          onClick={onRemove}
          className="size-5 ml-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center"
          title="Remove filter from dashboard"
        >
          <Trash2Icon className="size-3" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Select from Values Filter Chip
// ---------------------------------------------------------------------------

function SelectFilterChip({
  filter,
  value,
  options,
  onChange,
  isEditMode,
  onRemove,
}: {
  filter: DashboardFilter;
  value?: string | null;
  options: string[];
  onChange: (val: string | null) => void;
  isEditMode: boolean;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [customSearch, setCustomSearch] = useState("");

  const hasValue = Boolean(value && value !== "__all__");

  return (
    <div className="flex items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant={hasValue ? "secondary" : "outline"}
              size="sm"
              className={cn(
                "h-7 text-xs gap-1.5 font-normal px-2.5",
                hasValue && "border-primary/40 bg-primary/10 text-primary font-medium"
              )}
            />
          }
        >
          <ListFilterIcon className="size-3 text-muted-foreground" />
          <span className="font-medium text-foreground">{filter.name}:</span>
          <span className="truncate max-w-36">{hasValue ? value : "All"}</span>
        </PopoverTrigger>

        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            <CommandInput
              placeholder={`Search ${filter.name}...`}
              value={customSearch}
              onValueChange={setCustomSearch}
            />
            <CommandList className="max-h-60 p-1">
              <CommandEmpty className="py-2 px-3 text-xs text-muted-foreground">
                {customSearch ? (
                  <button
                    type="button"
                    onClick={() => {
                      onChange(customSearch);
                      setOpen(false);
                    }}
                    className="text-primary underline text-xs w-full text-left"
                  >
                    Filter by &ldquo;{customSearch}&rdquo;
                  </button>
                ) : (
                  "No values found"
                )}
              </CommandEmpty>

              <CommandGroup>
                {/* Reset / All */}
                <CommandItem
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="text-xs flex items-center justify-between cursor-pointer"
                >
                  <span className="italic text-muted-foreground">
                    All (No filter)
                  </span>
                  {!hasValue && <CheckIcon className="size-3.5 text-primary" />}
                </CommandItem>

                {/* Available options */}
                {options.map((opt) => (
                  <CommandItem
                    key={opt}
                    value={opt}
                    onSelect={() => {
                      onChange(opt);
                      setOpen(false);
                    }}
                    className="text-xs flex items-center justify-between cursor-pointer"
                  >
                    <span className="truncate">{opt}</span>
                    {value === opt && (
                      <CheckIcon className="size-3.5 text-primary" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Clear active filter button */}
      {hasValue && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="size-5 rounded-full hover:bg-muted flex items-center justify-center -ml-1 text-muted-foreground hover:text-foreground"
          title="Clear filter value"
        >
          <XIcon className="size-3" />
        </button>
      )}

      {/* Remove filter definition in edit mode */}
      {isEditMode && (
        <button
          type="button"
          onClick={onRemove}
          className="size-5 ml-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center"
          title="Remove filter from dashboard"
        >
          <Trash2Icon className="size-3" />
        </button>
      )}
    </div>
  );
}
