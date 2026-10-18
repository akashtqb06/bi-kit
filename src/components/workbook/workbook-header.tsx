'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { BarChart3Icon, ChevronLeftIcon, MoreHorizontalIcon, PencilIcon, CopyIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useWorkbookWorkspace } from './workbook-context';
import { UserMenu } from '@src/components/auth/user-menu';

export function WorkbookHeader() {
    const { workbook, renameWorkbook, duplicateWorkbook, deleteWorkbook } = useWorkbookWorkspace();

    const [isEditing, setIsEditing] = useState(false);
    const [nameInput, setNameInput] = useState('');
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const startEditing = () => {
        setNameInput(workbook?.name || '');
        setIsEditing(true);
    };

    const handleSaveRename = async () => {
        setIsEditing(false);
        if (!nameInput.trim() || nameInput.trim() === workbook?.name) {
            setNameInput(workbook?.name || '');
            return;
        }
        await renameWorkbook(nameInput.trim());
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            void handleSaveRename();
        } else if (e.key === 'Escape') {
            setNameInput(workbook?.name || '');
            setIsEditing(false);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await deleteWorkbook();
        } finally {
            setIsDeleting(false);
            setDeleteDialogOpen(false);
        }
    };

    return (
        <>
            <header className="h-12 border-b bg-background flex items-center justify-between px-3 shrink-0 select-none z-20">
                {/* Far Left: Back to workbooks logo button */}
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-foreground"
                        nativeButton={false}
                        render={<Link href="/workbooks" />}
                        title="Back to Workbooks"
                        aria-label="Back to Workbooks"
                    >
                        <ChevronLeftIcon className="size-4" />
                    </Button>
                    <div className="flex items-center gap-1.5 pl-1">
                        <BarChart3Icon className="size-4 text-primary" />
                        <span className="text-xs font-semibold tracking-tight text-foreground/80 hidden sm:inline">
                            BI Kit
                        </span>
                    </div>
                </div>

                {/* Center: Workbook Title with Status Icon (Click to rename) */}
                <div className="flex items-center justify-center flex-1 max-w-md mx-2">
                    {isEditing ? (
                        <Input
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            onBlur={() => void handleSaveRename()}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            className="h-7 text-xs font-medium text-center w-64 max-w-full bg-muted/40"
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={startEditing}
                            className="group flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-muted/60 transition-colors text-xs font-medium text-foreground max-w-xs truncate"
                            title="Click to rename workbook"
                        >
                            <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                            <span className="truncate">{workbook?.name || 'Loading...'}</span>
                            <PencilIcon className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0" />
                        </button>
                    )}
                </div>

                {/* Far Right: Theme toggle & Workbook actions */}
                <div className="flex items-center gap-1">
                    <UserMenu variant="compact" backToHome />

                    <DropdownMenu>
                        <DropdownMenuTrigger
                            render={
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 text-muted-foreground hover:text-foreground"
                                    aria-label="Workbook options"
                                />
                            }
                        >
                            <MoreHorizontalIcon className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" side="bottom">
                            <DropdownMenuItem
                                onClick={() => {
                                    startEditing();
                                }}
                            >
                                <PencilIcon className="mr-2 size-3.5" />
                                Rename workbook
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => {
                                    void duplicateWorkbook();
                                }}
                            >
                                <CopyIcon className="mr-2 size-3.5" />
                                Duplicate workbook
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                variant="destructive"
                                onClick={() => {
                                    setDeleteDialogOpen(true);
                                }}
                            >
                                <Trash2Icon className="mr-2 size-3.5" />
                                Delete workbook
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </header>

            {/* Delete confirmation dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Workbook</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete &ldquo;{workbook?.name}&rdquo;? All queries, charts, and
                            dashboards inside this workbook will be permanently deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={() => void handleDelete()}
                            disabled={isDeleting}
                        >
                            <Trash2Icon className="mr-1.5 size-4" />
                            {isDeleting ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
