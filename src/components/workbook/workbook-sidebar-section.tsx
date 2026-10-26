"use client";

import React, { useState, useRef, useEffect } from "react";
import { FolderPlusIcon, PlusIcon, Loader2Icon, FolderIcon, ChevronRightIcon } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getNextName } from "./workbook-context";

export interface WorkbookSidebarSectionProps {
  title: string;
  kind: "query" | "chart" | "dashboard";
  onAdd: () => void | Promise<unknown>;
  onAddFolder: () => void;
  isCreatingFolder?: boolean;
  onSaveNewFolder?: (name: string) => Promise<void>;
  onCancelNewFolder?: () => void;
  existingFolderNames?: string[];
  children: React.ReactNode;
  emptyText?: string;
  count?: number;
}

export function WorkbookSidebarSection({
  title,
  kind,
  onAdd,
  onAddFolder,
  isCreatingFolder = false,
  onSaveNewFolder,
  onCancelNewFolder,
  existingFolderNames = [],
  children,
  emptyText,
  count = 0,
}: WorkbookSidebarSectionProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Setup droppable for section root
  const { setNodeRef: setSectionDropRef, isOver } = useDroppable({
    id: `droppable-section-root-${kind}`,
    data: {
      targetType: "root",
      folderId: null,
      kind,
    },
  });

  useEffect(() => {
    if (isCreatingFolder) {
      const defaultName = getNextName("New folder", existingFolderNames);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNewFolderName(defaultName);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isCreatingFolder, existingFolderNames]);

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAdding) return;
    setIsAdding(true);
    try {
      await onAdd();
    } finally {
      setIsAdding(false);
    }
  };

  const handleSaveInlineFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      onCancelNewFolder?.();
      return;
    }
    if (onSaveNewFolder) {
      await onSaveNewFolder(trimmed);
    }
  };

  const handleInlineKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSaveInlineFolder();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancelNewFolder?.();
    }
  };

  const addAriaLabel =
    title === "Queries"
      ? "New query"
      : title === "Charts"
      ? "New chart"
      : title === "Dashboards"
      ? "New dashboard"
      : `New ${title.endsWith("ies") ? title.slice(0, -3) + "y" : title.endsWith("s") ? title.slice(0, -1) : title}`;

  return (
    <div
      ref={setSectionDropRef}
      className={cn(
        "space-y-1 rounded-md p-0.5 transition-colors",
        isOver && "ring-2 ring-primary/60 bg-primary/10"
      )}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between px-2 py-1 select-none">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
          {title}
        </span>
        <div className="flex items-center gap-0.5">
          <TooltipProvider delay={200}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-5 p-0 text-muted-foreground hover:text-foreground"
                    onClick={onAddFolder}
                    aria-label="New folder"
                  />
                }
              >
                <FolderPlusIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent side="top">New folder</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider delay={200}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-5 p-0 text-muted-foreground hover:text-foreground"
                    onClick={handleAdd}
                    disabled={isAdding}
                    aria-label={addAriaLabel}
                  />
                }
              >
                {isAdding ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <PlusIcon className="size-3.5" />
                )}
              </TooltipTrigger>
              <TooltipContent side="top">{addAriaLabel}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Inline New Folder Creation Row */}
      {isCreatingFolder && (
        <div className="flex items-center gap-1.5 rounded-md px-2 py-1 bg-accent/40 text-xs">
          <ChevronRightIcon className="size-3.5 text-muted-foreground/60 shrink-0" />
          <FolderIcon className="size-3.5 shrink-0 text-amber-500/90 dark:text-amber-400/90" />
          <Input
            ref={inputRef}
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={handleInlineKeyDown}
            onBlur={() => void handleSaveInlineFolder()}
            className="h-6 text-xs px-1.5 py-0 bg-background flex-1"
          />
        </div>
      )}

      {/* Item & Folder rows */}
      <div className="space-y-0.5">
        {count === 0 && !isCreatingFolder && emptyText ? (
          <div className="px-2 py-1.5 text-[11px] text-muted-foreground/60 italic select-none">
            {emptyText}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

