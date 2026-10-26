"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  MoreHorizontalIcon,
  PlusIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { FolderPublic } from "@src/lib/folders/service";

export interface WorkbookSidebarFolderProps {
  folder: FolderPublic;
  kind: "query" | "chart" | "dashboard";
  itemsCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  onRename: (newName: string) => Promise<boolean>;
  onDelete: (mode: "keep" | "delete") => Promise<boolean>;
  onAddItem: () => void;
  children: React.ReactNode;
}

export function WorkbookSidebarFolder({
  folder,
  kind,
  itemsCount,
  isExpanded,
  onToggle,
  onRename,
  onDelete,
  onAddItem,
  children,
}: WorkbookSidebarFolderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameInput, setRenameInput] = useState(folder.name);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [, setDeleteMode] = useState<"keep" | "delete">("keep");
  const [typedConfirm, setTypedConfirm] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `droppable-folder-${folder.id}`,
    data: {
      targetType: "folder",
      folderId: folder.id,
      kind: folder.kind,
    },
  });

  useEffect(() => {
    if (isRenaming) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRenameInput(folder.name);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isRenaming, folder.name]);

  const handleConfirmRename = async () => {
    const trimmed = renameInput.trim();
    if (!trimmed || trimmed === folder.name) {
      setIsRenaming(false);
      setRenameInput(folder.name);
      return;
    }
    const success = await onRename(trimmed);
    if (success) {
      setIsRenaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleConfirmRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsRenaming(false);
      setRenameInput(folder.name);
    }
  };

  const handleConfirmDelete = async (mode: "keep" | "delete") => {
    setIsDeleting(true);
    try {
      const ok = await onDelete(mode);
      if (ok) {
        setDeleteOpen(false);
        setTypedConfirm("");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const kindLabel = kind === "query" ? "query" : kind === "chart" ? "chart" : "dashboard";

  return (
    <div className="space-y-0.5">
      {/* Folder Row */}
      <div
        ref={setDropRef}
        onClick={() => {
          if (!isRenaming) onToggle();
        }}
        className={cn(
          "group relative flex items-center justify-between rounded-md px-2 py-1 text-xs cursor-pointer select-none transition-colors",
          isOver
            ? "bg-primary/15 ring-2 ring-primary/60 text-foreground"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1 py-0.5 mr-1">
          {/* Chevron */}
          <ChevronRightIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              isExpanded && "rotate-90"
            )}
          />

          {/* Folder Icon */}
          {isExpanded ? (
            <FolderOpenIcon className="size-3.5 shrink-0 text-amber-500/90 dark:text-amber-400/90" />
          ) : (
            <FolderIcon className="size-3.5 shrink-0 text-amber-500/90 dark:text-amber-400/90" />
          )}

          {/* Folder Name / Inline Edit */}
          {isRenaming ? (
            <Input
              ref={inputRef}
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => void handleConfirmRename()}
              onClick={(e) => e.stopPropagation()}
              className="h-6 text-xs px-1.5 py-0 bg-background"
            />
          ) : (
            <span className="truncate font-medium text-foreground/90">{folder.name}</span>
          )}
        </div>

        {/* Right side: item count + options menu */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[11px] text-muted-foreground/70 font-normal">
            {itemsCount}
          </span>

          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    "size-5 p-0 text-muted-foreground hover:text-foreground transition-opacity shrink-0",
                    dropdownOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}
                  aria-label="Folder options"
                  onClick={(e) => e.stopPropagation()}
                />
              }
            >
              <MoreHorizontalIcon className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddItem();
                  }}
                >
                  <PlusIcon className="mr-2 size-3.5" />
                  New {kindLabel} here
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsRenaming(true);
                  }}
                >
                  <PencilIcon className="mr-2 size-3.5" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteMode("keep");
                    setTypedConfirm("");
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2Icon className="mr-2 size-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Expanded items */}
      {isExpanded && (
        <div className="space-y-0.5">
          {itemsCount === 0 ? (
            <div className="pl-6 py-1 text-[11px] text-muted-foreground/60 italic select-none">
              Empty
            </div>
          ) : (
            children
          )}
        </div>
      )}

      {/* Delete Folder AlertDialog */}
      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) {
            setTypedConfirm("");
            setDeleteMode("keep");
          }
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              {itemsCount === 0 ? (
                <span>
                  Are you sure you want to delete &ldquo;{folder.name}&rdquo;? This action cannot be undone.
                </span>
              ) : (
                <span className="block">
                  Its {itemsCount} item{itemsCount === 1 ? "" : "s"} will move out of the folder.
                </span>
              )}

              {itemsCount > 0 && (
                <div className="rounded-md border p-3 bg-muted/30 space-y-2 mt-2 text-left">
                  <div className="text-xs font-semibold text-foreground">
                    Destructive option: Delete folder and its items
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    To permanently delete this folder AND all {itemsCount} item
                    {itemsCount === 1 ? "" : "s"} inside it, type{" "}
                    <strong className="text-foreground font-mono">{folder.name}</strong> below:
                  </p>
                  <Input
                    value={typedConfirm}
                    onChange={(e) => setTypedConfirm(e.target.value)}
                    placeholder={folder.name}
                    className="h-8 text-xs font-mono"
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full text-xs"
                    disabled={isDeleting || typedConfirm.trim() !== folder.name.trim()}
                    onClick={() => void handleConfirmDelete("delete")}
                  >
                    <Trash2Icon className="mr-1.5 size-3.5" />
                    {isDeleting ? "Deleting..." : "Delete folder and its items"}
                  </Button>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row justify-end gap-2">
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <Button
              variant={itemsCount > 0 ? "default" : "destructive"}
              size="sm"
              disabled={isDeleting}
              onClick={() => void handleConfirmDelete("keep")}
            >
              <Trash2Icon className="mr-1.5 size-3.5" />
              {isDeleting
                ? "Deleting..."
                : itemsCount > 0
                ? "Delete folder (keep items)"
                : "Delete folder"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

