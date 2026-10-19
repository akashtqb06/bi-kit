'use client';

import React, { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
    PlusIcon,
    BookOpenIcon,
    MoreHorizontalIcon,
    Trash2Icon,
    CopyIcon,
    PencilIcon,
    ExternalLinkIcon,
    RefreshCwIcon,
    AlertCircleIcon,
    Loader2Icon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable, DataTableColumnHeader } from '@src/components/ui/data-table';
import type { LegacyColumnDef } from '@tanstack/react-table/legacy';
import type { SortingState, PaginationState } from '@tanstack/react-table';
import type { WorkbookWithCounts } from '@src/lib/workbooks/service';
import { useCurrentUser } from '@src/components/auth/user-provider';
import { formatRelativeTime } from '@src/lib/utils';
import { toast } from 'sonner';

function formatFullDateTime(date: Date | string | null): string {
    if (!date) return '';
    try {
        return new Intl.DateTimeFormat('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(new Date(date));
    } catch {
        return '';
    }
}

function formatDate(date: Date | string | null): string {
    if (!date) return '—';
    try {
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        }).format(new Date(date));
    } catch {
        return '—';
    }
}

function WorkbooksContent() {
    const currentUser = useCurrentUser();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [workbooks, setWorkbooks] = useState<WorkbookWithCounts[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Dialog states
    const [createOpen, setCreateOpen] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const [renameOpen, setRenameOpen] = useState(false);
    const [renameTarget, setRenameTarget] = useState<WorkbookWithCounts | null>(null);
    const [renameTitle, setRenameTitle] = useState('');
    const [isRenaming, setIsRenaming] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState<WorkbookWithCounts | null>(null);
    const [isDeletingSingle, setIsDeletingSingle] = useState(false);

    // Initial state from URL search params
    const initialQuery = searchParams.get('q') ?? '';
    const [searchQuery, setSearchQuery] = useState(initialQuery);

    const initialSorting = useMemo<SortingState>(() => {
        const sortParam = searchParams.get('sort');
        if (!sortParam) {
            return [{ id: 'updatedAt', desc: true }];
        }
        const delimiter = sortParam.includes(':') ? ':' : '.';
        const [col, dir] = sortParam.split(delimiter);
        const colId = col === 'modified' ? 'updatedAt' : col === 'title' ? 'name' : col;
        return [{ id: colId, desc: dir?.toLowerCase() !== 'asc' }];
    }, [searchParams]);

    const [sorting, setSorting] = useState<SortingState>(initialSorting);

    const initialPagination = useMemo<PaginationState>(() => {
        const pageParam = parseInt(searchParams.get('page') || '1', 10);
        const sizeParam = parseInt(searchParams.get('size') || '10', 10);
        const pageIndex = Number.isNaN(pageParam) || pageParam < 1 ? 0 : pageParam - 1;
        const pageSize = [10, 20, 50].includes(sizeParam) ? sizeParam : 10;
        return { pageIndex, pageSize };
    }, [searchParams]);

    const [pagination, setPagination] = useState<PaginationState>(initialPagination);

    // Sync URL search params
    useEffect(() => {
        const params = new URLSearchParams();
        if (searchQuery.trim()) {
            params.set('q', searchQuery.trim());
        }
        if (sorting.length > 0) {
            const s = sorting[0];
            const sortKey = s.id === 'updatedAt' ? 'modified' : s.id === 'name' ? 'title' : s.id;
            params.set('sort', `${sortKey}:${s.desc ? 'desc' : 'asc'}`);
        }
        if (pagination.pageIndex > 0) {
            params.set('page', String(pagination.pageIndex + 1));
        }
        if (pagination.pageSize !== 10) {
            params.set('size', String(pagination.pageSize));
        }

        const queryStr = params.toString();
        const newUrl = queryStr ? `${pathname}?${queryStr}` : pathname;
        window.history.replaceState(null, '', newUrl);
    }, [searchQuery, sorting, pagination, pathname]);

    // Data fetching
    const fetchWorkbooks = useCallback(async () => {
        try {
            const res = await fetch('/api/workbooks');
            const json = (await res.json()) as { data?: WorkbookWithCounts[]; error?: string };
            if (!res.ok || !json.data) {
                throw new Error(json.error ?? 'Failed to load workbooks');
            }
            setWorkbooks(json.data);
            setLoadError(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load workbooks';
            setLoadError(message);
            toast.error('Unable to load workbooks', { description: message });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let active = true;
        fetch('/api/workbooks')
            .then((res) => res.json())
            .then((json: { data?: WorkbookWithCounts[]; error?: string }) => {
                if (!active) return;
                if (json.data) {
                    setWorkbooks(json.data);
                    setLoadError(null);
                } else {
                    setLoadError(json.error ?? 'Failed to load workbooks');
                }
            })
            .catch((err: unknown) => {
                if (!active) return;
                const message = err instanceof Error ? err.message : 'Failed to load workbooks';
                setLoadError(message);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    // Create workbook
    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = newTitle.trim();
        if (!trimmed) return;

        try {
            setIsCreating(true);
            const res = await fetch('/api/workbooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: trimmed }),
            });
            const json = (await res.json()) as { data?: WorkbookWithCounts; error?: string };
            if (!res.ok || !json.data) {
                throw new Error(json.error ?? 'Failed to create workbook');
            }
            toast.success(`Workbook "${trimmed}" created`);
            setCreateOpen(false);
            setNewTitle('');
            router.push(`/workbooks/${json.data.id}`);
        } catch (err) {
            toast.error('Failed to create workbook', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setIsCreating(false);
        }
    };

    // Rename workbook
    const handleRename = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!renameTarget) return;
        const trimmed = renameTitle.trim();
        if (!trimmed) return;

        try {
            setIsRenaming(true);
            const res = await fetch(`/api/workbooks/${renameTarget.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: trimmed }),
            });
            const json = (await res.json()) as { data?: WorkbookWithCounts; error?: string };
            if (!res.ok || !json.data) {
                throw new Error(json.error ?? 'Failed to rename workbook');
            }
            toast.success('Workbook renamed');
            setRenameOpen(false);
            setRenameTarget(null);
            await fetchWorkbooks();
        } catch (err) {
            toast.error('Failed to rename workbook', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setIsRenaming(false);
        }
    };

    // Duplicate workbook
    const handleDuplicate = useCallback(async (wb: WorkbookWithCounts) => {
        try {
            const res = await fetch(`/api/workbooks/${wb.id}/duplicate`, {
                method: 'POST',
            });
            const json = (await res.json()) as { data?: WorkbookWithCounts; error?: string };
            if (!res.ok || !json.data) {
                throw new Error(json.error ?? 'Failed to duplicate workbook');
            }
            toast.success(`"${wb.name}" duplicated`);
            await fetchWorkbooks();
        } catch (err) {
            toast.error('Failed to duplicate workbook', {
                description: err instanceof Error ? err.message : undefined,
            });
        }
    }, [fetchWorkbooks]);

    // Single delete
    const handleDeleteSingle = async () => {
        if (!deleteTarget) return;
        try {
            setIsDeletingSingle(true);
            const res = await fetch(`/api/workbooks/${deleteTarget.id}`, {
                method: 'DELETE',
            });
            const json = (await res.json()) as { data?: { ok: boolean }; error?: string };
            if (!res.ok) {
                throw new Error(json.error ?? 'Failed to delete workbook');
            }
            toast.success(`Workbook "${deleteTarget.name}" deleted`);
            setDeleteTarget(null);
            await fetchWorkbooks();
        } catch (err) {
            toast.error('Failed to delete workbook', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setIsDeletingSingle(false);
        }
    };

    // Bulk delete
    const handleBulkDelete = async (selected: WorkbookWithCounts[]) => {
        const ids = selected.map((s) => s.id);
        const res = await fetch('/api/workbooks', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
        });
        const json = (await res.json()) as { data?: { ok: boolean; count: number }; error?: string };
        if (!res.ok) {
            const errorMsg = json.error ?? 'Failed to delete workbooks';
            toast.error('Failed to delete workbooks', { description: errorMsg });
            throw new Error(errorMsg);
        }
        toast.success(`${ids.length} ${ids.length === 1 ? 'workbook' : 'workbooks'} deleted`);
        await fetchWorkbooks();
    };

    // Table Columns definition
    const columns = useMemo<LegacyColumnDef<WorkbookWithCounts, unknown>[]>(() => {
        const adminColumns: LegacyColumnDef<WorkbookWithCounts, unknown>[] = currentUser?.role === 'admin'
            ? [
                  {
                      accessorKey: 'owner',
                      id: 'owner',
                      header: ({ column }) => (
                          <DataTableColumnHeader column={column} title="Owner" />
                      ),
                      cell: ({ row }) => {
                          const wb = row.original;
                          const isMe = wb.ownerId === currentUser?.id;
                          const displayName = isMe ? 'You' : (wb.owner?.name || wb.owner?.email || 'Unknown');
                          const initials = isMe
                              ? 'YOU'
                              : (wb.owner?.name
                                    ? wb.owner.name.slice(0, 2).toUpperCase()
                                    : wb.owner?.email?.slice(0, 2).toUpperCase() ?? '??');
                          return (
                              <div className="flex items-center gap-2">
                                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                                      {initials.slice(0, 2)}
                                  </span>
                                  <span className="text-sm text-foreground truncate max-w-[120px]" title={wb.owner?.name || wb.owner?.email}>
                                      {displayName}
                                  </span>
                              </div>
                          );
                      },
                      enableSorting: false,
                  },
              ]
            : [];

        return [
            {
                id: 'select',
                header: ({ table }) => (
                    <div className="flex items-center justify-center px-1">
                        <Checkbox
                            checked={table.getIsAllPageRowsSelected()}
                            indeterminate={
                                table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()
                            }
                            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                            aria-label="Select all on page"
                        />
                    </div>
                ),
                cell: ({ row }) => (
                    <div className="flex items-center justify-center px-1">
                        <Checkbox
                            checked={row.getIsSelected()}
                            onCheckedChange={(value) => row.toggleSelected(!!value)}
                            aria-label="Select row"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                ),
                enableSorting: false,
                enableHiding: false,
            },
            {
                accessorKey: 'name',
                id: 'name',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
                cell: ({ row }) => {
                    const wb = row.original;
                    return (
                        <div className="flex flex-col gap-0.5 max-w-[280px] sm:max-w-[400px]">
                            <Link
                                href={`/workbooks/${wb.id}`}
                                className="font-medium text-foreground hover:underline truncate"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {wb.name}
                            </Link>
                            {wb.description ? (
                                <span className="text-xs text-muted-foreground truncate">
                                    {wb.description}
                                </span>
                            ) : null}
                        </div>
                    );
                },
                enableSorting: true,
            },
            ...adminColumns,
            {
                accessorKey: 'queriesCount',
                id: 'queries',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Queries" />,
                cell: ({ row }) => (
                    <span className="text-muted-foreground text-sm font-mono">
                        {row.original.queriesCount ?? 0}
                    </span>
                ),
                enableSorting: true,
            },
            {
                accessorKey: 'chartsCount',
                id: 'charts',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Charts" />,
                cell: ({ row }) => (
                    <span className="text-muted-foreground text-sm font-mono">
                        {row.original.chartsCount ?? 0}
                    </span>
                ),
                enableSorting: true,
            },
            {
                accessorKey: 'dashboardsCount',
                id: 'dashboards',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Dashboards" />,
                cell: ({ row }) => (
                    <span className="text-muted-foreground text-sm font-mono">
                        {row.original.dashboardsCount ?? 0}
                    </span>
                ),
                enableSorting: true,
            },
            {
                accessorKey: 'updatedAt',
                id: 'updatedAt',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Modified" />,
                cell: ({ row }) => {
                    const date = row.original.updatedAt || row.original.createdAt;
                    if (!date) return <span className="text-muted-foreground text-sm">—</span>;
                    const relative = formatRelativeTime(date);
                    const fullDate = formatFullDateTime(date);

                    return (
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <span className="text-muted-foreground text-sm cursor-default hover:text-foreground transition-colors" />
                                }
                            >
                                {relative}
                            </TooltipTrigger>
                            <TooltipContent side="top">{fullDate}</TooltipContent>
                        </Tooltip>
                    );
                },
                enableSorting: true,
            },
            {
                accessorKey: 'createdAt',
                id: 'createdAt',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
                cell: ({ row }) => {
                    return (
                        <span className="text-muted-foreground text-sm">
                            {formatDate(row.original.createdAt)}
                        </span>
                    );
                },
                enableSorting: true,
            },
            {
                id: 'actions',
                cell: ({ row }) => {
                    const wb = row.original;
                    return (
                        <div className="text-right" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    render={
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label="Workbook actions"
                                        />
                                    }
                                >
                                    <MoreHorizontalIcon className="size-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                    <DropdownMenuItem onClick={() => router.push(`/workbooks/${wb.id}`)}>
                                        <ExternalLinkIcon className="mr-2 size-4" />
                                        Open
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => {
                                            setRenameTarget(wb);
                                            setRenameTitle(wb.name);
                                            setRenameOpen(true);
                                        }}
                                    >
                                        <PencilIcon className="mr-2 size-4" />
                                        Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => void handleDuplicate(wb)}>
                                        <CopyIcon className="mr-2 size-4" />
                                        Duplicate
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        variant="destructive"
                                        onClick={() => setDeleteTarget(wb)}
                                    >
                                        <Trash2Icon className="mr-2 size-4" />
                                        Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    );
                },
                enableSorting: false,
                enableHiding: false,
            },
        ];
    }, [router, handleDuplicate, currentUser]);

    return (
        <TooltipProvider>
            <div className="h-full min-h-0 flex flex-col gap-6 p-6 overflow-hidden">
                {/* Page header row */}
                <div className="flex items-center justify-between shrink-0">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">Workbooks</h1>
                        <p className="text-sm text-muted-foreground">
                            Organize your queries, charts, and dashboards.
                        </p>
                    </div>
                    <Button onClick={() => setCreateOpen(true)}>
                        <PlusIcon className="mr-2 size-4" />
                        New Workbook
                    </Button>
                </div>

                {/* Error Banner */}
                {!loading && loadError && (
                    <div className="shrink-0 flex flex-col items-center justify-center p-6 border rounded-lg bg-card gap-4">
                        <Alert variant="destructive" className="max-w-md">
                            <AlertCircleIcon className="size-4" />
                            <AlertTitle>Workbooks could not be loaded</AlertTitle>
                            <AlertDescription>{loadError}</AlertDescription>
                        </Alert>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setLoading(true);
                                setLoadError(null);
                                void fetchWorkbooks();
                            }}
                        >
                            <RefreshCwIcon className="mr-2 size-4" />
                            Retry
                        </Button>
                    </div>
                )}

                {/* Data Table */}
                {(!loadError || loading) && (
                    <DataTable
                        className="flex-1 min-h-0"
                        columns={columns}
                        data={workbooks}
                        loading={loading}
                        loadingRowsCount={6}
                        searchKey="name"
                        searchPlaceholder="Filter by title..."
                        searchValue={searchQuery}
                        onSearchChange={setSearchQuery}
                        sorting={sorting}
                        onSortingChange={setSorting}
                        pagination={pagination}
                        onPaginationChange={setPagination}
                        onRowClick={(wb) => router.push(`/workbooks/${wb.id}`)}
                        onDeleteSelected={handleBulkDelete}
                        deleteConfirmTitle="Delete selected workbooks?"
                        deleteConfirmDescription="This will permanently delete the selected workbooks and all their dependent queries, charts, and dashboards."
                        emptyState={
                            <div className="flex flex-col items-center justify-center gap-3 py-10">
                                <BookOpenIcon className="size-10 text-muted-foreground/40" />
                                <div className="text-center">
                                    <p className="text-sm font-medium">No workbooks yet</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Create your first workbook to start building queries and charts.
                                    </p>
                                </div>
                                <Button size="sm" onClick={() => setCreateOpen(true)}>
                                    <PlusIcon className="mr-1.5 size-3.5" />
                                    New Workbook
                                </Button>
                            </div>
                        }
                        emptySearchState={
                            <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-center">
                                <p className="text-sm font-medium">No results for &apos;{searchQuery}&apos;</p>
                                <p className="text-xs text-muted-foreground">
                                    Try checking for spelling errors or clearing your filter.
                                </p>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="mt-2 text-xs"
                                    onClick={() => setSearchQuery('')}
                                >
                                    Clear search
                                </Button>
                            </div>
                        }
                    />
                )}

                {/* Create Workbook Dialog */}
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogContent className="sm:max-w-sm">
                        <DialogHeader>
                            <DialogTitle>New Workbook</DialogTitle>
                            <DialogDescription>
                                Enter a title to create your new workbook.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCreate} className="space-y-4 pt-1">
                            <Input
                                placeholder="e.g. Sales Analysis"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                autoFocus
                                required
                            />
                            <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0 pt-2 flex flex-row justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setCreateOpen(false)}
                                    disabled={isCreating}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={isCreating || !newTitle.trim()}>
                                    {isCreating && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                                    Create
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                {/* Rename Workbook Dialog */}
                <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
                    <DialogContent className="sm:max-w-sm">
                        <DialogHeader>
                            <DialogTitle>Rename Workbook</DialogTitle>
                            <DialogDescription>
                                Change the title of this workbook.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleRename} className="space-y-4 pt-1">
                            <Input
                                value={renameTitle}
                                onChange={(e) => setRenameTitle(e.target.value)}
                                autoFocus
                                required
                            />
                            <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0 pt-2 flex flex-row justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setRenameOpen(false)}
                                    disabled={isRenaming}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={isRenaming || !renameTitle.trim()}>
                                    {isRenaming && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                                    Save
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                {/* Delete Single Workbook Confirmation AlertDialog */}
                <AlertDialog
                    open={deleteTarget !== null}
                    onOpenChange={(open) => {
                        if (!open) setDeleteTarget(null);
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete workbook?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This
                                action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isDeletingSingle}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                variant="destructive"
                                disabled={isDeletingSingle}
                                onClick={async (e) => {
                                    e.preventDefault();
                                    await handleDeleteSingle();
                                }}
                            >
                                {isDeletingSingle && (
                                    <Loader2Icon className="mr-2 size-4 animate-spin" />
                                )}
                                Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </TooltipProvider>
    );
}

function WorkbooksSkeleton() {
    return (
        <div className="flex flex-1 flex-col gap-6 p-6">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-64" />
                </div>
                <Skeleton className="h-9 w-32" />
            </div>
            <div className="space-y-3">
                <Skeleton className="h-9 w-64" />
                <Skeleton className="h-64 w-full rounded-lg" />
            </div>
        </div>
    );
}

export default function WorkbooksPage() {
    return (
        <Suspense fallback={<WorkbooksSkeleton />}>
            <WorkbooksContent />
        </Suspense>
    );
}
