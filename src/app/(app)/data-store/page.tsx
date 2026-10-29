'use client';

import React, { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ColumnFiltersState, PaginationState, RowSelectionState, SortingState } from '@tanstack/react-table';
import type { LegacyColumnDef } from '@tanstack/react-table/legacy';
import {
    HardDriveIcon,
    DatabaseIcon,
    RefreshCwIcon,
    Trash2Icon,
    SettingsIcon,
    EyeIcon,
    MoreHorizontalIcon,
    PlusIcon,
    Loader2Icon,
    CheckCircle2Icon,
    AlertCircleIcon,
    XCircleIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable, DataTableColumnHeader } from '@src/components/ui/data-table';
import { ResyncBanner } from '@src/components/data-store/resync-banner';
import { SyncDialog } from '@src/components/data-store/sync-dialog';
import { TableSettingsSheet } from '@src/components/data-store/table-settings-sheet';
import { TablePreviewSheet } from '@src/components/data-store/table-preview-sheet';
import type { DataStoreTable } from '@src/lib/db/schema/data-store';
import type { DataSourcePublic } from '@src/lib/data-sources/service';

function formatBytes(bytes?: number): string {
    if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let val = bytes;
    let unitIdx = 0;
    while (val >= 1024 && unitIdx < units.length - 1) {
        val /= 1024;
        unitIdx++;
    }
    return `${val.toFixed(val >= 10 || unitIdx === 0 ? 0 : 1)} ${units[unitIdx]}`;
}

type StoreTableWithMeta = DataStoreTable & { dataSourceName?: string; queryName?: string };

function DataStoreContent() {
    const searchParams = useSearchParams();

    const [tables, setTables] = useState<StoreTableWithMeta[]>([]);
    const [dataSources, setDataSources] = useState<DataSourcePublic[]>([]);
    const [loading, setLoading] = useState(true);

    // Status & quotas
    const [needsResync, setNeedsResync] = useState(false);
    const [quotas, setQuotas] = useState<{ usedMb: number; maxMbPerUser: number } | null>(null);

    // Filters & table state
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSourceFilter, setSelectedSourceFilter] = useState<string>('__all__');
    const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);
    const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [columnFilters] = useState<ColumnFiltersState>([]);

    // Modals & Sheets
    const [syncDialogOpen, setSyncDialogOpen] = useState(() => searchParams?.get('action') === 'sync');
    const [initialSourceId] = useState<string | null>(() => searchParams?.get('sourceId') || null);

    const [settingsTarget, setSettingsTarget] = useState<DataStoreTable | null>(null);
    const [previewTarget, setPreviewTarget] = useState<{ id: string; name: string } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<DataStoreTable | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Fetch tables & status
    const fetchTables = useCallback(async () => {
        try {
            const url = new URL('/api/data-store/tables', window.location.origin);
            if (selectedSourceFilter !== '__all__') {
                url.searchParams.set('dataSourceId', selectedSourceFilter);
            }
            if (searchQuery.trim()) {
                url.searchParams.set('search', searchQuery.trim());
            }

            const [tablesRes, statusRes, dsRes] = await Promise.all([
                fetch(url.toString()),
                fetch('/api/data-store/status'),
                fetch('/api/data-sources'),
            ]);

            if (tablesRes.ok) {
                const json = await tablesRes.json();
                setTables(json.data || []);
            }
            if (statusRes.ok) {
                const json = await statusRes.json();
                setNeedsResync(json.data?.needsResync ?? false);
                setQuotas(json.data?.quotas ?? null);
            }
            if (dsRes.ok) {
                const json = await dsRes.json();
                setDataSources(json.data || []);
            }
        } catch {
            toast.error('Failed to load Data Store tables');
        } finally {
            setLoading(false);
        }
    }, [selectedSourceFilter, searchQuery]);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const url = new URL('/api/data-store/tables', window.location.origin);
                if (selectedSourceFilter !== '__all__') {
                    url.searchParams.set('dataSourceId', selectedSourceFilter);
                }
                if (searchQuery.trim()) {
                    url.searchParams.set('search', searchQuery.trim());
                }

                const [tablesRes, statusRes, dsRes] = await Promise.all([
                    fetch(url.toString()),
                    fetch('/api/data-store/status'),
                    fetch('/api/data-sources'),
                ]);

                if (!active) return;

                if (tablesRes.ok) {
                    const json = await tablesRes.json();
                    setTables(json.data || []);
                }
                if (statusRes.ok) {
                    const json = await statusRes.json();
                    setNeedsResync(json.data?.needsResync ?? false);
                    setQuotas(json.data?.quotas ?? null);
                }
                if (dsRes.ok) {
                    const json = await dsRes.json();
                    setDataSources(json.data || []);
                }
            } catch {
                toast.error('Failed to load Data Store tables');
            } finally {
                if (active) setLoading(false);
            }
        })();

        return () => {
            active = false;
        };
    }, [selectedSourceFilter, searchQuery]);

    // Sync now action
    const handleSyncNow = async (table: DataStoreTable) => {
        try {
            toast.info(`Syncing table "${table.storeTable}"...`);
            const res = await fetch(`/api/data-store/tables/${table.id}/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sync' }),
            });
            if (!res.ok) {
                const json = await res.json();
                throw new Error(json.error?.message || 'Sync failed');
            }
            toast.success(`Table "${table.storeTable}" synchronized successfully`);
            void fetchTables();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Sync failed');
            void fetchTables();
        }
    };

    // Cancel sync action
    const handleCancelSync = async (table: DataStoreTable) => {
        try {
            const res = await fetch(`/api/data-store/tables/${table.id}/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'cancel' }),
            });
            if (!res.ok) throw new Error('Failed to cancel sync');
            toast.success(`Sync cancelled for "${table.storeTable}"`);
            void fetchTables();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to cancel');
        }
    };

    // Single delete
    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/data-store/tables/${deleteTarget.id}`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('Failed to delete table');
            toast.success(`Table "${deleteTarget.storeTable}" deleted`);
            setDeleteTarget(null);
            void fetchTables();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Delete failed');
        } finally {
            setIsDeleting(false);
        }
    };

    // Bulk sync
    const _handleBulkSync = async (selected: StoreTableWithMeta[]) => {
        toast.info(`Syncing ${selected.length} tables...`);
        for (const tbl of selected) {
            void fetch(`/api/data-store/tables/${tbl.id}/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sync' }),
            });
        }
        setRowSelection({});
        setTimeout(() => void fetchTables(), 1000);
    };

    // Bulk delete
    const handleBulkDelete = async (selected: StoreTableWithMeta[]) => {
        try {
            for (const tbl of selected) {
                await fetch(`/api/data-store/tables/${tbl.id}`, { method: 'DELETE' });
            }
            toast.success(`Deleted ${selected.length} table(s)`);
            setRowSelection({});
            void fetchTables();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Bulk delete failed');
        }
    };

    // Columns definition
    const columns = useMemo<LegacyColumnDef<StoreTableWithMeta>[]>(() => {
        return [
            {
                id: 'select',
                header: ({ table }) => (
                    <div className="flex items-center pl-2">
                        <Checkbox
                            checked={table.getIsAllPageRowsSelected()}
                            onCheckedChange={(val) => table.toggleAllPageRowsSelected(!!val)}
                            aria-label="Select all"
                        />
                    </div>
                ),
                cell: ({ row }) => (
                    <div className="flex items-center pl-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                            checked={row.getIsSelected()}
                            onCheckedChange={(val) => row.toggleSelected(!!val)}
                            aria-label="Select row"
                        />
                    </div>
                ),
                enableSorting: false,
                enableHiding: false,
                size: 36,
            },
            {
                accessorKey: 'storeTable',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Table Name" />,
                cell: ({ row }) => {
                    const t = row.original;
                    return (
                        <div className="flex flex-col py-1">
                            <span className="font-mono text-xs font-semibold text-foreground">
                                {t.storeTable}
                            </span>
                            {t.kind === 'query' ? (
                                <span className="text-[11px] text-muted-foreground">
                                    Materialized Query: {t.sourceTable}
                                </span>
                            ) : (
                                <span className="text-[11px] text-muted-foreground font-mono">
                                    source: {t.sourceTable}
                                </span>
                            )}
                        </div>
                    );
                },
                size: 200,
            },
            {
                id: 'source',
                header: 'Data Source',
                cell: ({ row }) => {
                    const t = row.original;
                    if (t.kind === 'query') {
                        return (
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                <HardDriveIcon className="size-3 text-purple-500" />
                                <span>Query</span>
                            </span>
                        );
                    }
                    return (
                        <span className="inline-flex items-center gap-1.5 text-xs text-foreground font-medium">
                            <DatabaseIcon className="size-3 text-blue-500" />
                            <span>{t.dataSourceName || 'External Source'}</span>
                        </span>
                    );
                },
                size: 150,
            },
            {
                accessorKey: 'rowCount',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Rows" />,
                cell: ({ row }) => (
                    <span className="font-mono text-xs">
                        {row.original.rowCount.toLocaleString()}
                    </span>
                ),
                size: 90,
            },
            {
                accessorKey: 'sizeBytes',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Size" />,
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-muted-foreground">
                        {formatBytes(row.original.sizeBytes)}
                    </span>
                ),
                size: 90,
            },
            {
                accessorKey: 'lastSyncedAt',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Last Synced" />,
                cell: ({ row }) => {
                    const d = row.original.lastSyncedAt;
                    if (!d) return <span className="text-xs text-muted-foreground">Never</span>;
                    const dateObj = new Date(d);
                    return (
                        <Tooltip>
                            <TooltipTrigger render={<span className="text-xs text-muted-foreground cursor-default" />}>
                                {formatDistanceToNow(dateObj, { addSuffix: true })}
                            </TooltipTrigger>
                            <TooltipContent>
                                {format(dateObj, 'PPpp')}
                            </TooltipContent>
                        </Tooltip>
                    );
                },
                size: 130,
            },
            {
                accessorKey: 'status',
                header: 'Status',
                cell: ({ row }) => {
                    const t = row.original;
                    if (t.status === 'synced') {
                        return (
                            <Badge variant="outline" className="text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500/30 gap-1 text-[11px]">
                                <CheckCircle2Icon className="size-3 text-emerald-600" />
                                Synced
                            </Badge>
                        );
                    }
                    if (t.status === 'syncing') {
                        return (
                            <Badge variant="outline" className="text-blue-700 bg-blue-50 dark:bg-blue-950/20 border-blue-500/30 gap-1 text-[11px]">
                                <Loader2Icon className="size-3 animate-spin text-blue-600" />
                                Syncing ({t.rowCount.toLocaleString()})
                            </Badge>
                        );
                    }
                    if (t.status === 'error') {
                        return (
                            <Tooltip>
                                <TooltipTrigger render={<Badge variant="outline" className="text-red-700 bg-red-50 dark:bg-red-950/20 border-red-500/30 gap-1 text-[11px] cursor-help" />}>
                                    <AlertCircleIcon className="size-3 text-red-600" />
                                    Error
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs font-mono text-xs">
                                    {t.lastError || 'Unknown error occurred'}
                                </TooltipContent>
                            </Tooltip>
                        );
                    }
                    return (
                        <Badge variant="outline" className="text-muted-foreground text-[11px]">
                            Pending
                        </Badge>
                    );
                },
                size: 130,
            },
            {
                accessorKey: 'schedule',
                header: 'Schedule',
                cell: ({ row }) => (
                    <Badge variant="secondary" className="capitalize text-[10px] font-normal">
                        {row.original.schedule}
                    </Badge>
                ),
                size: 90,
            },
            {
                id: 'actions',
                cell: ({ row }) => {
                    const t = row.original;
                    return (
                        <div className="flex justify-end pr-2" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    render={<Button variant="ghost" size="icon-sm" aria-label="Actions" />}
                                >
                                    <MoreHorizontalIcon className="size-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                    <DropdownMenuGroup>
                                        <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                                            Actions
                                        </DropdownMenuLabel>
                                        <DropdownMenuItem onClick={() => setPreviewTarget({ id: t.id, name: t.storeTable })}>
                                            <EyeIcon className="mr-2 size-4" />
                                            Preview
                                        </DropdownMenuItem>
                                        {t.status === 'syncing' ? (
                                            <DropdownMenuItem onClick={() => void handleCancelSync(t)}>
                                                <XCircleIcon className="mr-2 size-4 text-amber-500" />
                                                Cancel sync
                                            </DropdownMenuItem>
                                        ) : (
                                            <DropdownMenuItem onClick={() => void handleSyncNow(t)}>
                                                <RefreshCwIcon className="mr-2 size-4" />
                                                Sync now
                                            </DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem onClick={() => setSettingsTarget(t)}>
                                            <SettingsIcon className="mr-2 size-4" />
                                            Settings
                                        </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        variant="destructive"
                                        onClick={() => setDeleteTarget(t)}
                                    >
                                        <Trash2Icon className="mr-2 size-4" />
                                        Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    );
                },
                size: 50,
            },
        ];
    }, []);

    // Filter controls for source
    const sourceFilterControl = useMemo(() => {
        return (
            <Select value={selectedSourceFilter} onValueChange={(val) => { if (val) setSelectedSourceFilter(val); }}>
                <SelectTrigger className="h-8 text-xs w-[180px]">
                    <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="__all__" className="text-xs">All Data Sources</SelectItem>
                    {dataSources.map((ds) => (
                        <SelectItem key={ds.id} value={ds.id} className="text-xs">
                            {ds.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        );
    }, [selectedSourceFilter, dataSources]);

    return (
        <div className="flex flex-1 flex-col h-full overflow-hidden p-6 gap-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                <div>
                    <div className="flex items-center gap-2">
                        <HardDriveIcon className="size-5 text-purple-600 dark:text-purple-400" />
                        <h1 className="text-xl font-bold tracking-tight">Data Store</h1>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        High-performance local tables synced from data sources and materialized queries for fast dashboard execution.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {quotas && (
                        <div className="text-right text-xs hidden md:block">
                            <span className="text-muted-foreground">Storage Quota: </span>
                            <span className="font-semibold text-foreground font-mono">{quotas.usedMb} MB</span>
                            <span className="text-muted-foreground"> / {quotas.maxMbPerUser} MB</span>
                        </div>
                    )}
                    <Button size="sm" onClick={() => setSyncDialogOpen(true)}>
                        <PlusIcon className="mr-1.5 size-4" />
                        Sync tables
                    </Button>
                </div>
            </div>

            {/* Re-sync alert banner */}
            <ResyncBanner needsResync={needsResync} onResynced={fetchTables} />

            {/* Main DataTable view */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <DataTable
                    columns={columns}
                    data={tables}
                    loading={loading}
                    searchKey="storeTable"
                    searchPlaceholder="Search store tables..."
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                    filters={sourceFilterControl}
                    sorting={sorting}
                    onSortingChange={setSorting}
                    pagination={pagination}
                    onPaginationChange={setPagination}
                    columnFilters={columnFilters}
                    rowSelection={rowSelection}
                    onRowSelectionChange={setRowSelection}
                    onRowClick={(row) => setPreviewTarget({ id: row.id, name: row.storeTable })}
                    onDeleteSelected={handleBulkDelete}
                    deleteConfirmTitle="Delete selected store tables?"
                    deleteConfirmDescription="This will permanently delete selected tables from local storage. Queries reading from them will fall back to their source."
                />
            </div>

            {/* Sync Tables Dialog */}
            <SyncDialog
                open={syncDialogOpen}
                onOpenChange={setSyncDialogOpen}
                initialSourceId={initialSourceId}
                onSuccess={fetchTables}
            />

            {/* Table Settings Sheet */}
            <TableSettingsSheet
                table={settingsTarget}
                open={!!settingsTarget}
                onOpenChange={(open) => !open && setSettingsTarget(null)}
                onSuccess={fetchTables}
            />

            {/* Table Preview Sheet */}
            <TablePreviewSheet
                tableId={previewTarget?.id || null}
                tableName={previewTarget?.name || ''}
                open={!!previewTarget}
                onOpenChange={(open) => !open && setPreviewTarget(null)}
            />

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {deleteTarget?.storeTable}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will drop the physical table from local storage. Any queries, charts, or dashboards referencing this table will stop working or revert to source querying.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting} onClick={() => setDeleteTarget(null)}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => void handleDeleteConfirm()}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting ? <Loader2Icon className="mr-1.5 size-4 animate-spin" /> : <Trash2Icon className="mr-1.5 size-4" />}
                            Delete Table
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default function DataStorePage() {
    return (
        <Suspense fallback={<div className="p-6">Loading Data Store...</div>}>
            <DataStoreContent />
        </Suspense>
    );
}
