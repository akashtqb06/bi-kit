'use client';

import React, { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ColumnFiltersState, PaginationState, RowSelectionState, SortingState } from '@tanstack/react-table';
import type { LegacyColumnDef } from '@tanstack/react-table/legacy';
import {
    DatabaseIcon,
    FileTextIcon,
    MoreHorizontalIcon,
    Trash2Icon,
    TableIcon,
    FileUpIcon,
    Loader2Icon,
    DownloadIcon,
    PlusIcon,
    PencilIcon,
    PlugZapIcon,
    AlertCircleIcon,
    SearchIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { DataTable, DataTableColumnHeader } from '@src/components/ui/data-table';
import { AddDataSourceDialog } from '@src/components/datasource/add-data-source-dialog';
import { SchemaBrowserSheet } from '@src/components/datasource/schema-browser-sheet';
import { useCurrentUser } from '@src/components/auth/user-provider';
import type { DataSourcePublic } from '@src/lib/data-sources/service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const typeIcons: Record<string, React.ReactNode> = {
    sqlite: <DatabaseIcon className="size-3.5" />,
    csv: <FileTextIcon className="size-3.5" />,
};

const typeLabels: Record<string, string> = {
    sqlite: 'SQLite',
    csv: 'CSV',
};

function formatRelativeTime(date: Date | string | null): string {
    if (!date) return '—';
    try {
        const d = typeof date === 'string' ? new Date(date) : date;
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        if (diffSec < 60) return 'just now';
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
        const diffHour = Math.floor(diffMin / 60);
        if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
        const diffDay = Math.floor(diffHour / 24);
        if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        }).format(d);
    } catch {
        return '—';
    }
}

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

type ConnectionStatus = 'unknown' | 'testing' | 'connected' | 'error';

// ---------------------------------------------------------------------------
// Main Page Content Component
// ---------------------------------------------------------------------------

function DataSourcesContent() {
    const currentUser = useCurrentUser();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [dataSources, setDataSources] = useState<DataSourcePublic[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingSample, setLoadingSample] = useState(false);

    // Row connection status cache: { [id]: status }
    const [statusMap, setStatusMap] = useState<Record<string, ConnectionStatus>>({});

    // Dialog & Sheet states
    const [dialogOpen, setDialogOpen] = useState(false);
    const [replaceTarget, setReplaceTarget] = useState<{ id: string; name: string } | null>(null);

    const [schemaSheetOpen, setSchemaSheetOpen] = useState(false);
    const [schemaSourceId, setSchemaSourceId] = useState<string | null>(null);
    const [schemaSourceName, setSchemaSourceName] = useState('');

    const [renameOpen, setRenameOpen] = useState(false);
    const [renameTarget, setRenameTarget] = useState<DataSourcePublic | null>(null);
    const [renameName, setRenameName] = useState('');
    const [isRenaming, setIsRenaming] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState<DataSourcePublic | null>(null);
    const [isDeletingSingle, setIsDeletingSingle] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Initial state from URL search params
    const initialQuery = searchParams.get('q') ?? '';
    const [searchQuery, setSearchQuery] = useState(initialQuery);

    const initialType = searchParams.get('type') ?? 'all';
    const [typeFilter, setTypeFilter] = useState<'all' | 'sqlite' | 'csv'>(
        initialType === 'sqlite' || initialType === 'csv' ? initialType : 'all'
    );

    const initialSorting = useMemo<SortingState>(() => {
        const sortParam = searchParams.get('sort');
        if (!sortParam) {
            return [{ id: 'updatedAt', desc: true }];
        }
        const delimiter = sortParam.includes(':') ? ':' : '.';
        const [col, dir] = sortParam.split(delimiter);
        const colId = col === 'modified' ? 'updatedAt' : col;
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
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    // Sync URL search params
    useEffect(() => {
        const params = new URLSearchParams();
        if (searchQuery.trim()) {
            params.set('q', searchQuery.trim());
        }
        if (typeFilter !== 'all') {
            params.set('type', typeFilter);
        }
        if (sorting.length > 0) {
            const s = sorting[0];
            const sortKey = s.id === 'updatedAt' ? 'modified' : s.id;
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
    }, [searchQuery, typeFilter, sorting, pagination, pathname]);

    // Data fetching
    const fetchDataSources = useCallback(async () => {
        try {
            const res = await fetch('/api/data-sources');
            const json = (await res.json()) as { data?: DataSourcePublic[]; error?: string };
            if (!res.ok || !json.data) {
                throw new Error(json.error ?? 'Failed to load data sources');
            }
            setDataSources(json.data);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load data sources';
            toast.error('Unable to load data sources', { description: message });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let active = true;
        fetch('/api/data-sources')
            .then((res) => res.json() as Promise<{ data?: DataSourcePublic[]; error?: string }>)
            .then((json) => {
                if (!active) return;
                if (json.data) {
                    setDataSources(json.data);
                }
            })
            .catch(() => {})
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, []);

    // ---------------------------------------------------------------------------
    // Actions & Handlers
    // ---------------------------------------------------------------------------

    const handleSchemaView = useCallback((id: string, name: string) => {
        setSchemaSourceId(id);
        setSchemaSourceName(name);
        setSchemaSheetOpen(true);
    }, []);

    const handleDataSourceDialogChange = useCallback((open: boolean) => {
        setDialogOpen(open);
        if (!open) setReplaceTarget(null);
    }, []);

    const loadSampleData = async () => {
        setLoadingSample(true);
        try {
            const res = await fetch('/api/data-sources/sample', { method: 'POST' });
            const json = (await res.json()) as { data?: { created?: boolean }; error?: string };
            if (!res.ok) {
                toast.error('Could not load sample data', { description: json.error });
                return;
            }
            toast.success(json.data?.created ? 'Sample data loaded' : 'Sample data is already available');
            await fetchDataSources();
        } catch {
            toast.error('Could not load sample data', { description: 'An unexpected error occurred.' });
        } finally {
            setLoadingSample(false);
        }
    };

    const testConnection = useCallback(async (id: string, name: string) => {
        setStatusMap((prev) => ({ ...prev, [id]: 'testing' }));
        try {
            const res = await fetch(`/api/data-sources/${id}/test`, { method: 'POST' });
            const json = (await res.json()) as { data?: { ok: boolean; tableCount?: number }; error?: string };
            if (!res.ok) {
                setStatusMap((prev) => ({ ...prev, [id]: 'error' }));
                toast.error(`Connection to "${name}" failed`, {
                    description: json.error ?? 'Connection test failed.',
                });
                return;
            }
            setStatusMap((prev) => ({ ...prev, [id]: 'connected' }));
            const countDesc = json.data?.tableCount !== undefined ? ` (${json.data.tableCount} tables)` : '';
            toast.success(`Connection to "${name}" successful${countDesc}`);
            if (json.data?.tableCount !== undefined) {
                const count = json.data.tableCount;
                setDataSources((prev) => prev.map((ds) => (ds.id === id ? { ...ds, tableCount: count } : ds)));
            }
        } catch {
            setStatusMap((prev) => ({ ...prev, [id]: 'error' }));
            toast.error(`Connection to "${name}" failed`, {
                description: 'An unexpected network error occurred.',
            });
        }
    }, []);

    const openRenameDialog = useCallback((source: DataSourcePublic) => {
        setRenameTarget(source);
        setRenameName(source.name);
        setRenameOpen(true);
    }, []);

    const handleRenameSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!renameTarget || !renameName.trim() || isRenaming) return;
        setIsRenaming(true);
        try {
            const res = await fetch(`/api/data-sources/${renameTarget.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: renameName.trim() }),
            });
            const json = (await res.json()) as { data?: DataSourcePublic; error?: string };
            if (!res.ok || !json.data) {
                throw new Error(json.error ?? 'Failed to rename data source');
            }
            toast.success(`Renamed to "${renameName.trim()}"`);
            setDataSources((prev) =>
                prev.map((ds) => (ds.id === renameTarget.id ? { ...ds, name: renameName.trim() } : ds))
            );
            setRenameOpen(false);
            setRenameTarget(null);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Rename failed';
            toast.error('Rename failed', { description: msg });
        } finally {
            setIsRenaming(false);
        }
    };

    const confirmSingleDelete = async () => {
        if (!deleteTarget || isDeletingSingle) return;
        setIsDeletingSingle(true);
        setDeleteError(null);
        try {
            const res = await fetch(`/api/data-sources/${deleteTarget.id}`, { method: 'DELETE' });
            const json = (await res.json()) as { data?: unknown; error?: string };
            if (!res.ok) {
                const errorMsg = json.error ?? 'Failed to delete data source';
                setDeleteError(errorMsg);
                toast.error('Cannot delete data source', { description: errorMsg });
                return;
            }
            toast.success(`"${deleteTarget.name}" deleted`);
            setDataSources((prev) => prev.filter((ds) => ds.id !== deleteTarget.id));
            setDeleteTarget(null);
        } catch {
            const msg = 'An unexpected error occurred while deleting.';
            setDeleteError(msg);
            toast.error('Delete failed', { description: msg });
        } finally {
            setIsDeletingSingle(false);
        }
    };

    const handleBulkDelete = async (selected: DataSourcePublic[]) => {
        if (selected.length === 0) return;
        const ids = selected.map((s) => s.id);
        try {
            const res = await fetch('/api/data-sources', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids }),
            });
            const json = (await res.json()) as {
                data?: { deleted: string[]; blocked: { id: string; name: string; queryCount: number }[] };
                error?: string;
            };

            if (!res.ok || !json.data) {
                throw new Error(json.error ?? 'Bulk delete failed');
            }

            const { deleted, blocked } = json.data;

            if (deleted.length > 0) {
                toast.success(`Deleted ${deleted.length} data source${deleted.length === 1 ? '' : 's'}`);
                setDataSources((prev) => prev.filter((ds) => !deleted.includes(ds.id)));
            }

            if (blocked.length > 0) {
                const blockedDetails = blocked.map((b) => `"${b.name}" (${b.queryCount} queries)`).join(', ');
                toast.error(
                    `Could not delete ${blocked.length} data source${blocked.length === 1 ? '' : 's'} with dependent queries`,
                    { description: blockedDetails }
                );
            }

            setRowSelection({});
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Bulk delete failed';
            toast.error('Bulk delete failed', { description: message });
        }
    };

    // ---------------------------------------------------------------------------
    // Column Definitions
    // ---------------------------------------------------------------------------

    const columns = useMemo<LegacyColumnDef<DataSourcePublic, unknown>[]>(
        () => [
            {
                id: 'select',
                header: ({ table }) => (
                    <div className="flex items-center justify-center">
                        <Checkbox
                            checked={table.getIsAllPageRowsSelected()}
                            indeterminate={table.getIsSomePageRowsSelected()}
                            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                            aria-label="Select all"
                        />
                    </div>
                ),
                cell: ({ row }) => (
                    <div className="flex items-center justify-center">
                        <Checkbox
                            checked={row.getIsSelected()}
                            onCheckedChange={(value) => row.toggleSelected(!!value)}
                            aria-label="Select row"
                        />
                    </div>
                ),
                enableSorting: false,
                enableHiding: false,
            },
            {
                accessorKey: 'name',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
                cell: ({ row }) => {
                    const source = row.original;
                    return (
                        <div className="flex items-center gap-2">
                            <span className="text-muted-foreground shrink-0">
                                {typeIcons[source.type] ?? <DatabaseIcon className="size-3.5" />}
                            </span>
                            <button
                                type="button"
                                onClick={() => handleSchemaView(source.id, source.name)}
                                className="font-medium text-foreground hover:underline text-left truncate max-w-[240px] sm:max-w-xs"
                            >
                                {source.name}
                            </button>
                        </div>
                    );
                },
                enableSorting: true,
                enableHiding: false,
            },
            ...(currentUser?.role === 'admin'
                ? ([
                      {
                          id: 'owner',
                          header: ({ column }) => (
                              <DataTableColumnHeader column={column} title="Owner" />
                          ),
                          cell: ({ row }) => {
                              const source = row.original;
                              const isMe = source.ownerId === currentUser?.id;
                              const displayName = isMe ? 'You' : (source.owner?.name || source.owner?.email || 'Unknown');
                              const initials = isMe
                                  ? 'YOU'
                                  : (source.owner?.name
                                        ? source.owner.name.slice(0, 2).toUpperCase()
                                        : source.owner?.email?.slice(0, 2).toUpperCase() ?? '??');
                              return (
                                  <div className="flex items-center gap-2">
                                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                                          {initials.slice(0, 2)}
                                      </span>
                                      <span className="text-sm text-foreground truncate max-w-[120px]" title={source.owner?.name || source.owner?.email}>
                                          {displayName}
                                      </span>
                                  </div>
                              );
                          },
                          enableSorting: false,
                      },
                  ] as LegacyColumnDef<DataSourcePublic, unknown>[])
                : []),
            {
                accessorKey: 'type',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
                cell: ({ row }) => {
                    const type = row.original.type;
                    return (
                        <Badge variant="secondary" className="gap-1.5 font-normal">
                            {typeIcons[type]}
                            {typeLabels[type] ?? type}
                        </Badge>
                    );
                },
                enableSorting: true,
                filterFn: (row, id, value) => {
                    if (!value || value === 'all') return true;
                    return row.getValue(id) === value;
                },
            },
            {
                accessorKey: 'tableCount',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Tables" />,
                cell: ({ row }) => {
                    const count = row.original.tableCount;
                    return (
                        <span className="font-mono text-xs text-muted-foreground">
                            {count !== null && count !== undefined ? count : '—'}
                        </span>
                    );
                },
                enableSorting: true,
            },
            {
                accessorKey: 'queryCount',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Queries" />,
                cell: ({ row }) => {
                    const count = row.original.queryCount ?? 0;
                    return <span className="font-mono text-xs text-muted-foreground">{count}</span>;
                },
                enableSorting: true,
            },
            {
                id: 'status',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
                cell: ({ row }) => {
                    const id = row.original.id;
                    const name = row.original.name;
                    const status = statusMap[id] ?? 'unknown';

                    if (status === 'testing') {
                        return (
                            <Badge variant="secondary" className="gap-1 text-muted-foreground font-normal">
                                <Loader2Icon className="size-3 animate-spin" />
                                Testing
                            </Badge>
                        );
                    }
                    if (status === 'connected') {
                        return (
                            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-normal">
                                Connected
                            </Badge>
                        );
                    }
                    if (status === 'error') {
                        return (
                            <Badge variant="destructive" className="font-normal">
                                Error
                            </Badge>
                        );
                    }
                    return (
                        <button
                            type="button"
                            onClick={() => testConnection(id, name)}
                            className="inline-flex items-center group"
                            title="Click to test connection"
                        >
                            <Badge
                                variant="secondary"
                                className="text-muted-foreground font-normal group-hover:border-primary/40 group-hover:text-foreground transition-colors"
                            >
                                Unknown
                            </Badge>
                        </button>
                    );
                },
                enableSorting: false,
            },
            {
                accessorKey: 'updatedAt',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Modified" />,
                cell: ({ row }) => {
                    const date = row.original.updatedAt ?? row.original.createdAt;
                    return (
                        <Tooltip>
                            <TooltipTrigger className="cursor-default text-xs text-muted-foreground">
                                {formatRelativeTime(date)}
                            </TooltipTrigger>
                            <TooltipContent>{formatFullDateTime(date)}</TooltipContent>
                        </Tooltip>
                    );
                },
                sortingFn: (rowA: { original: DataSourcePublic }, rowB: { original: DataSourcePublic }) => {
                    const timeA = new Date(rowA.original.updatedAt ?? rowA.original.createdAt ?? 0).getTime();
                    const timeB = new Date(rowB.original.updatedAt ?? rowB.original.createdAt ?? 0).getTime();
                    return timeA - timeB;
                },
                enableSorting: true,
            },
            {
                id: 'actions',
                cell: ({ row }) => {
                    const source = row.original;
                    return (
                        <div className="flex justify-end">
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    render={<Button variant="ghost" size="icon-sm" aria-label="Actions" />}
                                >
                                    <MoreHorizontalIcon className="size-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem onClick={() => handleSchemaView(source.id, source.name)}>
                                        <TableIcon className="mr-2 size-4" />
                                        View schema
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => testConnection(source.id, source.name)}>
                                        <PlugZapIcon className="mr-2 size-4" />
                                        Test connection
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openRenameDialog(source)}>
                                        <PencilIcon className="mr-2 size-4" />
                                        Rename
                                    </DropdownMenuItem>
                                    {source.type === 'csv' && (
                                        <DropdownMenuItem
                                            onClick={() => setReplaceTarget({ id: source.id, name: source.name })}
                                        >
                                            <FileUpIcon className="mr-2 size-4" />
                                            Replace file
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        variant="destructive"
                                        onClick={() => {
                                            setDeleteError(null);
                                            setDeleteTarget(source);
                                        }}
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
        ],
        [handleSchemaView, testConnection, openRenameDialog, statusMap, currentUser]
    );

    // Controlled column filters
    const columnFilters = useMemo<ColumnFiltersState>(() => {
        const filters: ColumnFiltersState = [];
        if (typeFilter !== 'all') {
            filters.push({ id: 'type', value: typeFilter });
        }
        return filters;
    }, [typeFilter]);

    // Type filter select component for the toolbar
    const typeFilterControl = (
        <Select
            value={typeFilter}
            items={[
                { value: 'all', label: 'All Types' },
                { value: 'sqlite', label: 'SQLite' },
                { value: 'csv', label: 'CSV' },
            ]}
            onValueChange={(val) => {
                setTypeFilter(val as 'all' | 'sqlite' | 'csv');
                setPagination((prev) => ({ ...prev, pageIndex: 0 }));
            }}
        >
            <SelectTrigger className="h-9 w-[130px] text-xs sm:text-sm">
                <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="sqlite">SQLite</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
            </SelectContent>
        </Select>
    );

    // Empty state
    const emptyState = (
        <div className="flex flex-col items-center justify-center p-12 text-center">
            <DatabaseIcon className="mb-3 size-10 text-muted-foreground/50" />
            <p className="text-sm font-medium">No data sources yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Add a data source to start querying your data.</p>
            <div className="mt-4 flex items-center gap-2">
                <Button onClick={() => setDialogOpen(true)}>
                    <PlusIcon className="mr-1.5 size-4" />
                    Add Data Source
                </Button>
                <Button variant="outline" onClick={loadSampleData} disabled={loadingSample}>
                    {loadingSample ? (
                        <Loader2Icon className="mr-1.5 size-4 animate-spin" />
                    ) : (
                        <DownloadIcon className="mr-1.5 size-4" />
                    )}
                    Load sample data
                </Button>
            </div>
        </div>
    );

    // Empty search / filter state
    const emptySearchState = (
        <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <SearchIcon className="size-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No results found</p>
            <p className="text-xs text-muted-foreground">No data sources match your search or filter criteria.</p>
            {(searchQuery || typeFilter !== 'all') && (
                <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 text-xs"
                    onClick={() => {
                        setSearchQuery('');
                        setTypeFilter('all');
                    }}
                >
                    Clear filters
                </Button>
            )}
        </div>
    );

    return (
        <div className="h-full min-h-0 flex flex-col gap-6 p-6 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">Data Sources</h1>
                        <p className="text-sm text-muted-foreground">Connect SQl lite and csv</p>
                    </div>
                </div>
                <Button onClick={() => setDialogOpen(true)}>
                    <PlusIcon className="mr-2 size-4" />
                    Add Data Source
                </Button>
            </div>

            {/* Main Data Table */}
            <DataTable
                className="flex-1 min-h-0"
                columns={columns}
                data={dataSources}
                loading={loading}
                searchKey="name"
                searchPlaceholder="Filter data sources..."
                searchValue={searchQuery}
                onSearchChange={(val) => {
                    setSearchQuery(val);
                    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
                }}
                filters={typeFilterControl}
                sorting={sorting}
                onSortingChange={setSorting}
                pagination={pagination}
                onPaginationChange={setPagination}
                columnFilters={columnFilters}
                rowSelection={rowSelection}
                onRowSelectionChange={setRowSelection}
                onRowClick={(row) => handleSchemaView(row.id, row.name)}
                emptyState={emptyState}
                emptySearchState={emptySearchState}
                onDeleteSelected={handleBulkDelete}
                deleteConfirmTitle="Delete selected data sources?"
                deleteConfirmDescription="This action cannot be undone. Sources with dependent queries will be blocked from deletion."
            />

            {/* Add / Replace Data Source Dialog */}
            <AddDataSourceDialog
                key={replaceTarget?.id ?? 'add'}
                open={dialogOpen || replaceTarget !== null}
                onOpenChange={handleDataSourceDialogChange}
                onSuccess={fetchDataSources}
                sourceToReplace={replaceTarget}
            />

            {/* Schema Browser Sheet */}
            <SchemaBrowserSheet
                dataSourceId={schemaSourceId}
                dataSourceName={schemaSourceName}
                open={schemaSheetOpen}
                onOpenChange={setSchemaSheetOpen}
            />

            {/* Inline Rename Dialog */}
            <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rename Data Source</DialogTitle>
                        <DialogDescription>Enter a new name for &quot;{renameTarget?.name}&quot;.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleRenameSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="rename-input">Name</Label>
                            <Input
                                id="rename-input"
                                value={renameName}
                                onChange={(e) => setRenameName(e.target.value)}
                                autoFocus
                                required
                            />
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setRenameOpen(false)}
                                disabled={isRenaming}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isRenaming || !renameName.trim()}>
                                {isRenaming ? (
                                    <Loader2Icon className="mr-1.5 size-4 animate-spin" />
                                ) : (
                                    <PencilIcon className="mr-1.5 size-4" />
                                )}
                                {isRenaming ? 'Renaming...' : 'Save'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Single Delete Confirmation Dialog */}
            <AlertDialog
                open={!!deleteTarget}
                onOpenChange={(open) => {
                    if (!open && !isDeletingSingle) {
                        setDeleteTarget(null);
                        setDeleteError(null);
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
                        <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>

                    {deleteError && (
                        <Alert variant="destructive">
                            <AlertCircleIcon className="size-4" />
                            <AlertTitle>Cannot delete data source</AlertTitle>
                            <AlertDescription>{deleteError}</AlertDescription>
                        </Alert>
                    )}

                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeletingSingle}>
                            {deleteError ? 'Close' : 'Cancel'}
                        </AlertDialogCancel>
                        {!deleteError && (
                            <Button variant="destructive" onClick={confirmSingleDelete} disabled={isDeletingSingle}>
                                {isDeletingSingle ? (
                                    <Loader2Icon className="mr-1.5 size-4 animate-spin" />
                                ) : (
                                    <Trash2Icon className="mr-1.5 size-4" />
                                )}
                                {isDeletingSingle ? 'Deleting...' : 'Delete'}
                            </Button>
                        )}
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default function DataSourcesPage() {
    return (
        <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading...</div>}>
            <DataSourcesContent />
        </Suspense>
    );
}
