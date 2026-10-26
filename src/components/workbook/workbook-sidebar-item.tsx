"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  TableIcon,
  BarChart2Icon,
  LineChartIcon,
  AreaChartIcon,
  PieChartIcon,
  HashIcon,
  Table2Icon,
  LayoutDashboardIcon,
  MoreHorizontalIcon,
  PencilIcon,
  CopyIcon,
  Trash2Icon,
  FolderIcon,
  FolderPlusIcon,
  CheckIcon,
  DownloadIcon,
} from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { FolderPublic } from "@src/lib/folders/service";

export interface WorkbookSidebarItemProps {
  id: string;
  name: string;
  type: "query" | "chart" | "dashboard";
  chartType?: string;
  isActive: boolean;
  href: string;
  folderId?: string | null;
  folders?: FolderPublic[];
  isIndented?: boolean;
  onRename: (id: string, newName: string) => Promise<void> | void;
  onDuplicate: (id: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onMoveToFolder?: (folderId: string | null) => Promise<void> | void;
  onCreateFolderAndMove?: () => Promise<void> | void;
  onDownloadPng?: (id: string, name: string) => Promise<void> | void;
}

export function renderItemIcon(type: "query" | "chart" | "dashboard", chartType?: string) {
  if (type === "query") {
    return <TableIcon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />;
  }
  if (type === "dashboard") {
    return <LayoutDashboardIcon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />;
  }
  switch (chartType) {
    case "line":
      return <LineChartIcon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />;
    case "area":
      return <AreaChartIcon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />;
    case "pie":
    case "donut":
      return <PieChartIcon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />;
    case "number":
      return <HashIcon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />;
    case "table":
      return <Table2Icon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />;
    case "bar":
    case "row":
    default:
      return <BarChart2Icon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />;
  }
}

export function WorkbookSidebarItem({
  id,
  name,
  type,
  chartType,
  isActive,
  href,
  folderId = null,
  folders = [],
  isIndented = false,
  onRename,
  onDuplicate,
  onDelete,
  onMoveToFolder,
  onCreateFolderAndMove,
  onDownloadPng,
}: WorkbookSidebarItemProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameInput, setRenameInput] = useState(name);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `item-${type}-${id}`,
    data: {
      type,
      id,
      name,
      chartType,
      folderId,
    },
  });

  const handleConfirmRename = async () => {
    if (!renameInput.trim()) return;
    await onRename(id, renameInput.trim());
    setRenameOpen(false);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(id);
    } finally {
      setIsDeleting(false);
      setDeleteOpen(false);
    }
  };

  return (
    <>
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className={cn(
          "group relative flex items-center justify-between rounded-md px-2 py-1 text-xs transition-colors cursor-pointer select-none",
          isIndented && "pl-6",
          isDragging && "opacity-40",
          isActive
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
      >
        <Link
          href={href}
          className="flex items-center gap-2 min-w-0 flex-1 py-0.5 truncate outline-none"
        >
          {renderItemIcon(type, chartType)}
          <span className="truncate">{name}</span>
        </Link>

        {/* Hover "⋮" DropdownMenu */}
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
                aria-label="Item options"
                onClick={(e) => e.stopPropagation()}
              />
            }
          >
            <MoreHorizontalIcon className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => {
                  setRenameInput(name);
                  setRenameOpen(true);
                }}
              >
                <PencilIcon className="mr-2 size-3.5" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  void onDuplicate(id);
                }}
              >
                <CopyIcon className="mr-2 size-3.5" />
                Duplicate
              </DropdownMenuItem>
              {type === "chart" && onDownloadPng && (
                <DropdownMenuItem
                  onClick={() => {
                    void onDownloadPng(id, name);
                  }}
                >
                  <DownloadIcon className="mr-2 size-3.5" />
                  Download PNG
                </DropdownMenuItem>
              )}

              {/* Move to folder submenu */}
              {onMoveToFolder && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FolderIcon className="mr-2 size-3.5" />
                    <span>Move to folder</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Folders</DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={() => {
                          void onMoveToFolder(null);
                        }}
                      >
                        {!folderId ? (
                          <CheckIcon className="mr-2 size-3.5 text-primary" />
                        ) : (
                          <span className="mr-2 size-3.5 inline-block" />
                        )}
                        <span>No folder</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {folders.map((f) => (
                        <DropdownMenuItem
                          key={f.id}
                          onClick={() => {
                            void onMoveToFolder(f.id);
                          }}
                        >
                          {folderId === f.id ? (
                            <CheckIcon className="mr-2 size-3.5 text-primary" />
                          ) : (
                            <span className="mr-2 size-3.5 inline-block" />
                          )}
                          <span className="truncate">{f.name}</span>
                        </DropdownMenuItem>
                      ))}
                      {onCreateFolderAndMove && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              void onCreateFolderAndMove();
                            }}
                          >
                            <FolderPlusIcon className="mr-2 size-3.5" />
                            <span>New folder...</span>
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
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

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Rename {type}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleConfirmRename();
              }}
              autoFocus
              className="h-8 text-xs"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRenameOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={() => void handleConfirmRename()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {type}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{name}&rdquo;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void handleConfirmDelete()}
              disabled={isDeleting}
            >
              <Trash2Icon className="mr-1.5 size-4" />
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

