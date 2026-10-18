"use client";

import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface RightPanelProps {
  title?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function RightPanel({
  title,
  headerAction,
  children,
  className,
}: RightPanelProps) {
  return (
    <aside
      className={cn(
        "w-80 shrink-0 border-l bg-background flex flex-col h-full overflow-y-auto",
        className
      )}
    >
      {title && (
        <div className="h-10 border-b px-3 flex items-center justify-between shrink-0 bg-muted/20">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      <ScrollArea className="flex-1">
        <div className="p-3.5 space-y-5 text-xs">{children}</div>
      </ScrollArea>
    </aside>
  );
}

export interface RightPanelSectionProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function RightPanelSection({
  title,
  description,
  action,
  children,
  className,
}: RightPanelSectionProps) {
  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h4>
        {action}
      </div>
      {description && (
        <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
          {description}
        </p>
      )}
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export interface RightPanelRowProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

export function RightPanelRow({ label, value, className }: RightPanelRowProps) {
  return (
    <div className={cn("flex items-center justify-between py-1 text-xs", className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

