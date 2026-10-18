"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KeyboardIcon } from "lucide-react";

interface ShortcutGroup {
  category: string;
  items: { key: string; description: string }[];
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    category: "Query Editor",
    items: [
      { key: "⌘ + Enter / Ctrl + Enter", description: "Run query immediately in Builder or SQL mode" },
      { key: "Tab", description: "Indent or move through query builder controls" },
      { key: "Esc", description: "Close schema browser or column search popovers" },
    ],
  },
  {
    category: "Query Pipeline",
    items: [
      { key: "Drag Handle (⠿)", description: "Reorder pipeline steps (Join, Filter, Summarize, etc.)" },
      { key: "Delete Button", description: "Remove a step from the execution pipeline" },
      { key: "Convert to SQL", description: "Switch pipeline to raw SQL mode for inspection or editing" },
    ],
  },
  {
    category: "Dashboards",
    items: [
      { key: "Edit / View Mode", description: "Toggle grid editing, dragging, and resizing" },
      { key: "Auto Refresh", description: "Poll and refresh dashboard queries (30s, 1m, 5m)" },
      { key: "Tile Actions", description: "Jump directly to linked chart editor or refresh query data" },
    ],
  },
  {
    category: "General",
    items: [
      { key: "?", description: "Open this keyboard shortcuts dialog (when not in an input)" },
      { key: "Esc", description: "Close any open dialog or sheet" },
    ],
  },
];

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If typing in input, textarea, or contentEditable, do not intercept '?'
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
        title="Keyboard Shortcuts (?)"
        aria-label="Keyboard shortcuts"
      >
        <KeyboardIcon className="size-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyboardIcon className="size-5" />
              Keyboard Shortcuts & Tips
            </DialogTitle>
            <DialogDescription>
              Quick reference for shortcuts and navigation in BI Kit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            {SHORTCUTS.map((group) => (
              <div key={group.category} className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.category}
                </h4>
                <div className="rounded-lg border divide-y bg-muted/20">
                  {group.items.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between p-2.5 text-xs"
                    >
                      <span className="text-foreground">{item.description}</span>
                      <kbd className="ml-2 shrink-0 rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground shadow-xs">
                        {item.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

