'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { MoreHorizontalIcon, PencilIcon, Trash2Icon, PlusIcon, AlertCircleIcon, RefreshCwIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceItem {
    id: string;
    name: string;
}

const nameSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(255, 'Name must be 255 characters or fewer'),
});

type NameValues = z.infer<typeof nameSchema>;

interface PanelListProps {
    items: WorkspaceItem[];
    loading: boolean;
    error?: string | null;
    onRetry?: () => void;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onAdd: (name: string) => Promise<void>;
    onRename: (id: string, name: string) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    addLabel: string;
    emptyLabel: string;
    emptyHint: string;
    icon: React.ReactNode;
}

// ---------------------------------------------------------------------------
// RenameDialog
// ---------------------------------------------------------------------------

function RenameDialog({
    open,
    defaultName,
    onOpenChange,
    onConfirm,
}: {
    open: boolean;
    defaultName: string;
    onOpenChange: (v: boolean) => void;
    onConfirm: (name: string) => void;
}) {
    const form = useForm<NameValues>({
        resolver: zodResolver(nameSchema),
        defaultValues: { name: defaultName },
    });

    useEffect(() => {
        if (open) form.reset({ name: defaultName });
    }, [defaultName, form, open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xs">
                <DialogHeader>
                    <DialogTitle>Rename</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(({ name }) => {
                            onConfirm(name);
                            onOpenChange(false);
                        })}
                        className="space-y-4"
                    >
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="sr-only">Name</FormLabel>
                                    <FormControl>
                                        <Input autoFocus placeholder="New name" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0">
                            <Button type="submit" className="w-full">
                                Rename
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

// ---------------------------------------------------------------------------
// AddDialog
// ---------------------------------------------------------------------------

function AddDialog({
    open,
    addLabel,
    onOpenChange,
    onConfirm,
}: {
    open: boolean;
    addLabel: string;
    onOpenChange: (v: boolean) => void;
    onConfirm: (name: string) => void;
}) {
    const form = useForm<NameValues>({
        resolver: zodResolver(nameSchema),
        defaultValues: { name: '' },
    });

    const handleOpen = (v: boolean) => {
        if (!v) form.reset({ name: '' });
        onOpenChange(v);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpen}>
            <DialogContent className="sm:max-w-xs">
                <DialogHeader>
                    <DialogTitle>{addLabel}</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(({ name }) => {
                            onConfirm(name);
                            handleOpen(false);
                        })}
                        className="space-y-4"
                    >
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="sr-only">Name</FormLabel>
                                    <FormControl>
                                        <Input autoFocus placeholder="Name" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0">
                            <Button type="submit" className="w-full">
                                Create
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

// ---------------------------------------------------------------------------
// PanelList
// ---------------------------------------------------------------------------

export function PanelList({
    items,
    loading,
    error,
    onRetry,
    selectedId,
    onSelect,
    onAdd,
    onRename,
    onDelete,
    addLabel,
    emptyLabel,
    emptyHint,
    icon,
}: PanelListProps) {
    const [addOpen, setAddOpen] = useState(false);
    const [renameTarget, setRenameTarget] = useState<WorkspaceItem | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<WorkspaceItem | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const handleAdd = async (name: string) => {
        try {
            await onAdd(name);
        } catch {
            toast.error('Failed to create');
        }
    };

    const handleRename = async (name: string) => {
        if (!renameTarget) return;
        try {
            await onRename(renameTarget.id, name);
        } catch {
            toast.error('Failed to rename');
        }
        setRenameTarget(null);
    };

    const confirmDelete = async (id: string) => {
        setDeletingId(id);
        try {
            await onDelete(id);
        } catch {
            toast.error('Failed to delete');
        } finally {
            setDeletingId(null);
            setDeleteTarget(null);
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Add button */}
            <div className="flex items-center justify-between px-3 py-2 border-b">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {addLabel.split(' ').at(-1)}s
                </span>
                <Button variant="ghost" size="icon-sm" onClick={() => setAddOpen(true)} aria-label={addLabel}>
                    <PlusIcon className="size-3.5" />
                </Button>
            </div>

            <ScrollArea className="flex-1">
                {/* Skeleton */}
                {loading && (
                    <div className="space-y-1 p-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} className="h-8 w-full rounded-md" />
                        ))}
                    </div>
                )}

                {!loading && error && (
                    <div className="p-3">
                        <Alert variant="destructive">
                            <AlertCircleIcon className="size-4" />
                            <AlertTitle>Unable to load items</AlertTitle>
                            <AlertDescription className="space-y-2">
                                <span>{error}</span>
                                {onRetry && (
                                    <Button variant="outline" size="sm" onClick={onRetry}>
                                        <RefreshCwIcon className="mr-2 size-3.5" />
                                        Retry
                                    </Button>
                                )}
                            </AlertDescription>
                        </Alert>
                    </div>
                )}

                {/* Empty state */}
                {!loading && !error && items.length === 0 && (
                    <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
                        <span className="text-muted-foreground/50">{icon}</span>
                        <p className="text-xs font-medium text-muted-foreground">{emptyLabel}</p>
                        <p className="text-xs text-muted-foreground/70">{emptyHint}</p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-1 h-7 text-xs"
                            onClick={() => setAddOpen(true)}
                        >
                            <PlusIcon className="mr-1 size-3" />
                            {addLabel}
                        </Button>
                    </div>
                )}

                {/* Item list */}
                {!loading && !error && items.length > 0 && (
                    <div className="space-y-0.5 p-1.5">
                        {items.map((item) => (
                            <div
                                key={item.id}
                                className={cn(
                                    'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/70 transition-colors',
                                    selectedId === item.id && 'bg-muted font-medium',
                                    deletingId === item.id && 'opacity-50 pointer-events-none'
                                )}
                                onClick={() => onSelect(item.id)}
                            >
                                <span className="flex-1 truncate">{item.name}</span>
                                <DropdownMenu>
                                    <DropdownMenuTrigger
                                        render={
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                className="size-5 opacity-0 group-hover:opacity-100 shrink-0"
                                                aria-label="Item actions"
                                            />
                                        }
                                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                    >
                                        <MoreHorizontalIcon className="size-3.5" />
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" side="bottom">
                                        <DropdownMenuItem
                                            onClick={() => {
                                                setRenameTarget(item);
                                            }}
                                        >
                                            <PencilIcon className="mr-2 size-3.5" />
                                            Rename
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            variant="destructive"
                                            onClick={() => {
                                                setDeleteTarget(item);
                                            }}
                                        >
                                            <Trash2Icon className="mr-2 size-3.5" />
                                            Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>

            {/* Dialogs */}
            <AddDialog
                open={addOpen}
                addLabel={addLabel}
                onOpenChange={setAddOpen}
                onConfirm={(name) => void handleAdd(name)}
            />
            {renameTarget && (
                <RenameDialog
                    open={!!renameTarget}
                    defaultName={renameTarget.name}
                    onOpenChange={(v) => {
                        if (!v) setRenameTarget(null);
                    }}
                    onConfirm={(name) => void handleRename(name)}
                />
            )}
            <AlertDialog
                open={!!deleteTarget}
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {addLabel.replace('Add ', '')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;? This action cannot be
                            undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={!!deletingId}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={!!deletingId}
                            onClick={() => {
                                if (deleteTarget) void confirmDelete(deleteTarget.id);
                            }}
                        >
                            <Trash2Icon className="mr-1.5 size-4" />
                            {deletingId ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
