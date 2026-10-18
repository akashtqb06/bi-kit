"use client";

import React from "react";
import { FolderPlusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface WorkbookSidebarSectionProps {
  title: string;
  onAdd: () => void;
  children: React.ReactNode;
  emptyText?: string;
  count?: number;
}

export function WorkbookSidebarSection({
  title,
  onAdd,
  children,
  emptyText,
  count = 0,
}: WorkbookSidebarSectionProps) {
  return (
    <div className="space-y-1">
      {/* Header Row */}
      <div className="flex items-center justify-between px-2 py-1 select-none">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
          {title}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-5 p-0 text-muted-foreground hover:text-foreground"
            title="New folder (coming soon)"
            aria-label="New folder"
          >
            <FolderPlusIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-5 p-0 text-muted-foreground hover:text-foreground"
            onClick={onAdd}
            title={`New ${title.endsWith("ies") ? title.slice(0, -3) + "y" : title.slice(0, -1)}`}
            aria-label={`New ${title}`}
          >
            <PlusIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Item rows */}
      <div className="space-y-0.5">
        {count === 0 && emptyText ? (
          <div className="px-2 py-1.5 text-[11px] text-muted-foreground/60 italic">
            {emptyText}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

