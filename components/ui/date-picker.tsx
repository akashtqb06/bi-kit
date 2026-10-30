"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { DateRange } from "react-day-picker";

export function parseDate(value?: string | Date | null): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? undefined : value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      return new Date(year, month, day);
    }
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

export function formatDateToISO(date?: Date | null): string {
  if (!date || isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface DatePickerProps {
  id?: string;
  name?: string;
  value?: string | Date | null;
  onChange?: (dateStr: string) => void;
  onSelectDate?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  clearable?: boolean;
  min?: string | Date;
  max?: string | Date;
  displayFormat?: string;
  required?: boolean;
  "aria-label"?: string;
}

export function DatePicker({
  id,
  name,
  value,
  onChange,
  onSelectDate,
  placeholder = "Pick a date",
  disabled = false,
  className,
  clearable = false,
  min,
  max,
  displayFormat = "MMM d, yyyy",
  required = false,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const selectedDate = React.useMemo(() => parseDate(value), [value]);
  const minDate = React.useMemo(() => parseDate(min), [min]);
  const maxDate = React.useMemo(() => parseDate(max), [max]);

  const handleSelect = (newDate: Date | undefined) => {
    const iso = newDate ? formatDateToISO(newDate) : "";
    onChange?.(iso);
    onSelectDate?.(newDate);
    setOpen(false);
  };

  const handleClear = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    onChange?.("");
    onSelectDate?.(undefined);
  };

  const isDateDisabled = React.useCallback(
    (d: Date) => {
      if (minDate && d < minDate) return true;
      if (maxDate && d > maxDate) return true;
      return false;
    },
    [minDate, maxDate]
  );

  return (
    <div className={cn("inline-flex relative items-center", className?.includes("w-") ? "" : "w-full")}>
      {name && (
        <input
          type="hidden"
          name={name}
          value={selectedDate ? formatDateToISO(selectedDate) : ""}
          required={required}
        />
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              disabled={disabled}
              className={cn(
                "w-full justify-start text-left font-normal h-9 text-xs px-2.5 gap-2 bg-background border-input hover:bg-accent hover:text-accent-foreground",
                !selectedDate && "text-muted-foreground",
                className
              )}
              aria-label={ariaLabel || placeholder}
            />
          }
        >
          <CalendarIcon className="size-3.5 shrink-0 opacity-70" />
          <span className="truncate flex-1">
            {selectedDate ? format(selectedDate, displayFormat) : placeholder}
          </span>
          {clearable && selectedDate && !disabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear date"
              className="size-4 -mr-1 rounded-sm hover:bg-muted text-muted-foreground hover:text-foreground inline-flex items-center justify-center shrink-0 cursor-pointer"
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  handleClear();
                }
              }}
            >
              <X className="size-3" />
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            disabled={isDateDisabled}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export interface DateRangePickerProps {
  id?: string;
  value?: DateRange;
  onChange?: (range: DateRange | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  clearable?: boolean;
  displayFormat?: string;
  "aria-label"?: string;
}

export function DateRangePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date range",
  disabled = false,
  className,
  clearable = false,
  displayFormat = "MMM d, yyyy",
  "aria-label": ariaLabel,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  const displayText = React.useMemo(() => {
    if (value?.from) {
      if (value.to) {
        return `${format(value.from, displayFormat)} - ${format(value.to, displayFormat)}`;
      }
      return format(value.from, displayFormat);
    }
    return placeholder;
  }, [value, displayFormat, placeholder]);

  return (
    <div className={cn("inline-flex relative items-center", className?.includes("w-") ? "" : "w-full")}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              disabled={disabled}
              className={cn(
                "w-full justify-start text-left font-normal h-9 text-xs px-2.5 gap-2 bg-background border-input hover:bg-accent hover:text-accent-foreground",
                !value?.from && "text-muted-foreground",
                className
              )}
              aria-label={ariaLabel || placeholder}
            />
          }
        >
          <CalendarIcon className="size-3.5 shrink-0 opacity-70" />
          <span className="truncate flex-1">{displayText}</span>
          {clearable && value?.from && !disabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear range"
              className="size-4 -mr-1 rounded-sm hover:bg-muted text-muted-foreground hover:text-foreground inline-flex items-center justify-center shrink-0 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onChange?.(undefined);
              }}
            >
              <X className="size-3" />
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={value}
            onSelect={onChange}
            numberOfMonths={2}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
