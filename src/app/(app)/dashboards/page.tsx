'use client';

import React, { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
    PlusIcon,
    LayoutDashboardIcon,
    MoreVerticalIcon,
    Trash2Icon,
    CopyIcon,
    PencilIcon,
    ExternalLinkIcon,
    RefreshCwIcon,
    AlertCircleIcon,
    Loader2Icon,
    CheckIcon,
    ChevronsUpDownIcon,
    HeartIcon,
    EyeIcon,
    BarChart2Icon,
    ClockIcon,
    SearchIcon,
    LayoutGridIcon,
    TableIcon,
    BookOpenIcon,
    SlidersHorizontalIcon,
    HashIcon,
    LineChartIcon,
    PieChartIcon,
    BarChart3Icon,
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
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Command,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandSeparator,
} from '@/components/ui/command';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DataTable, DataTableColumnHeader } from '@src/components/ui/data-table';
import type { LegacyColumnDef } from '@tanstack/react-table/legacy';
import type { SortingState, PaginationState } from '@tanstack/react-table';
import type { DashboardSummary } from '@src/lib/dashboards/service';
import type { WorkbookWithCounts } from '@src/lib/workbooks/service';
import type { LayoutItem } from '@src/lib/schemas';
import { useCurrentUser } from '@src/components/auth/user-provider';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function formatRelativeTime(date: Date | string | null): string {
    if (!date) return '—';
    try {
        return formatDistanceToNow(new Date(date), { addSuffix: true });
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

// ---------------------------------------------------------------------------
// Miniature Dashboard Component
// ---------------------------------------------------------------------------

function getMiniatureChartIcon(type?: string) {
    switch (type) {
        case 'number':
            return <HashIcon className="size-2.5 sm:size-3 text-blue-600 dark:text-blue-400 stroke-[2.2]" />;
        case 'line':
        case 'area':
            return <LineChartIcon className="size-2.5 sm:size-3 text-emerald-600 dark:text-emerald-400 stroke-[2.2]" />;
        case 'donut':
        case 'pie':
            return <PieChartIcon className="size-2.5 sm:size-3 text-amber-600 dark:text-amber-400 stroke-[2.2]" />;
        case 'table':
            return <TableIcon className="size-2.5 sm:size-3 text-purple-600 dark:text-purple-400 stroke-[2.2]" />;
        case 'filter':
            return <SlidersHorizontalIcon className="size-2.5 sm:size-3 text-neutral-600 dark:text-neutral-400 stroke-[2.2]" />;
        case 'bar':
        case 'row':
        default:
            return <BarChart3Icon className="size-2.5 sm:size-3 text-indigo-600 dark:text-indigo-400 stroke-[2.2]" />;
    }
}

function getMiniatureChartTint(type?: string) {
    switch (type) {
        case 'number':
            return 'bg-blue-500/10 border-blue-500/30';
        case 'line':
        case 'area':
            return 'bg-emerald-500/10 border-emerald-500/30';
        case 'donut':
        case 'pie':
            return 'bg-amber-500/10 border-amber-500/30';
        case 'table':
            return 'bg-purple-500/10 border-purple-500/30';
        case 'filter':
            return 'bg-neutral-500/10 border-neutral-500/30';
        case 'bar':
        case 'row':
        default:
            return 'bg-indigo-500/10 border-indigo-500/30';
    }
}

function DashboardMiniature({ layout }: { layout?: LayoutItem[] }) {
    if (!layout || layout.length === 0) {
        return (
            <div className="relative aspect-[16/9] w-full bg-muted/40 border-b flex flex-col items-center justify-center gap-1.5 p-4 text-muted-foreground select-none">
                <LayoutDashboardIcon className="size-6 text-muted-foreground/40 stroke-[1.5]" />
                <span className="text-xs text-muted-foreground/60 font-medium">Empty dashboard</span>
            </div>
        );
    }

    const maxY = Math.max(...layout.map((item) => (item.y ?? 0) + (item.h ?? 2)), 12);

    return (
        <div className="relative aspect-[16/9] w-full bg-muted/40 border-b overflow-hidden p-1.5 select-none">
            <div className="relative w-full h-full">
                {layout.map((item) => {
                    const left = `${((item.x ?? 0) / 12) * 100}%`;
                    const width = `${((item.w ?? 2) / 12) * 100}%`;
                    const top = `${((item.y ?? 0) / maxY) * 100}%`;
                    const height = `${((item.h ?? 2) / maxY) * 100}%`;

                    return (
                        <div
                            key={item.i}
                            style={{ left, top, width, height }}
                            className="absolute p-0.5"
                        >
                            <div
                                className={cn(
                                    'w-full h-full rounded-[3px] border flex items-center justify-center shadow-xs transition-colors',
                                    getMiniatureChartTint(item.chartType)
                                )}
                            >
                                {getMiniatureChartIcon(item.chartType)}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Dashboard Tile Card
// ---------------------------------------------------------------------------

function DashboardTileCard({
    dashboard,
    onToggleFavorite,
    onOpenRename,
    onDuplicate,
    onOpenDelete,
}: {
    dashboard: DashboardSummary;
    onToggleFavorite: (d: DashboardSummary) => void;
    onOpenRename: (d: DashboardSummary) => void;
    onDuplicate: (d: DashboardSummary) => void;
    onOpenDelete: (d: DashboardSummary) => void;
}) {
    const router = useRouter();
    const currentUser = useCurrentUser();
    const isMe = dashboard.ownerId === currentUser?.id;
    const ownerDisplay = isMe ? 'You' : (dashboard.owner?.name || dashboard.owner?.email || 'Unknown');

    return (
        <div
            onClick={() => router.push(`/dashboards/${dashboard.id}`)}
            className="group rounded-lg border bg-card hover:border-foreground/30 hover:shadow-sm transition-all duration-150 cursor-pointer overflow-hidden flex flex-col"
        >
            {/* Top: 16:9 preview area */}
            <DashboardMiniature layout={dashboard.layout} />

            {/* Bottom: Info and metadata */}
            <div className="p-3.5 flex flex-col gap-2 flex-1 justify-between">
                <div>
                    <div className="flex items-center justify-between gap-2">
                        <h3
                            className="font-medium text-sm truncate text-foreground flex-1 min-w-0"
                            title={dashboard.title}
                        >
                            {dashboard.title}
                        </h3>
                        <div className="flex items-center gap-0.5 shrink-0">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onToggleFavorite(dashboard);
                                }}
                                className={cn(
                                    'p-1 rounded-md transition-colors hover:bg-muted text-muted-foreground cursor-pointer',
                                    dashboard.isFavorite && 'text-red-500 hover:text-red-600'
                                )}
                                aria-label={dashboard.isFavorite ? 'Remove favorite' : 'Add favorite'}
                            >
                                <HeartIcon
                                    className={cn(
                                        'size-4 transition-colors',
                                        dashboard.isFavorite && 'fill-current text-red-500'
                                    )}
                                />
                            </button>
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    render={
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                            }}
                                            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                                            aria-label="More options"
                                        >
                                            <MoreVerticalIcon className="size-4" />
                                        </button>
                                    }
                                />
                                <DropdownMenuContent
                                    align="end"
                                    className="w-44"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <DropdownMenuItem onClick={() => router.push(`/dashboards/${dashboard.id}`)}>
                                        <ExternalLinkIcon className="mr-2 size-3.5" />
                                        Open
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => router.push(`/workbooks/${dashboard.workbookId}`)}>
                                        <BookOpenIcon className="mr-2 size-3.5" />
                                        Open workbook
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onOpenRename(dashboard)}>
                                        <PencilIcon className="mr-2 size-3.5" />
                                        Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onDuplicate(dashboard)}>
                                        <CopyIcon className="mr-2 size-3.5" />
                                        Duplicate
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onClick={() => onOpenDelete(dashboard)}
                                    >
                                        <Trash2Icon className="mr-2 size-3.5" />
                                        Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate pt-0.5">
                        by <span className="text-foreground/80 font-medium">{ownerDisplay}</span>
                    </div>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                    <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1" title={`${dashboard.viewCount ?? 0} views`}>
                            <EyeIcon className="size-3.5" />
                            <span>{dashboard.viewCount ?? 0}</span>
                        </span>
                        <span className="flex items-center gap-1" title={`${dashboard.chartCount ?? 0} charts`}>
                            <BarChart2Icon className="size-3.5" />
                            <span>{dashboard.chartCount ?? 0}</span>
                        </span>
                        <span className="flex items-center gap-1" title={formatFullDateTime(dashboard.updatedAt)}>
                            <ClockIcon className="size-3.5" />
                            <span>{formatRelativeTime(dashboard.updatedAt)}</span>
                        </span>
                    </div>
                    <span
                        className="truncate max-w-[110px] text-[11px] bg-muted/60 px-1.5 py-0.5 rounded border border-border/40 text-muted-foreground"
                        title={dashboard.workbookTitle}
                    >
                        {dashboard.workbookTitle}
                    </span>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main Dashboards Content
// ---------------------------------------------------------------------------

function DashboardsContent() {
    const currentUser = useCurrentUser();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [dashboards, setDashboards] = useState<DashboardSummary[]>([]);
    const [workbooksList, setWorkbooksList] = useState<WorkbookWithCounts[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // View mode: tile (default) or table. Persisted in localStorage and URL ?view=
    const initialViewMode = useMemo<'tile' | 'table'>(() => {
        const urlView = searchParams.get('view');
        if (urlView === 'tile' || urlView === 'table') return urlView;
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('dashboards-view-mode');
            if (saved === 'tile' || saved === 'table') return saved;
        }
        return 'tile';
    }, [searchParams]);

    const [viewMode, setViewMode] = useState<'tile' | 'table'>(initialViewMode);

    // Tabs filter: All, Recents, Favorites
    const initialFilter = useMemo<'all' | 'recents' | 'favorites'>(() => {
        const f = searchParams.get('filter');
        if (f === 'recents' || f === 'favorites') return f;
        return 'all';
    }, [searchParams]);

    const [tabFilter, setTabFilter] = useState<'all' | 'recents' | 'favorites'>(initialFilter);

    // Search query
    const initialQuery = searchParams.get('q') ?? '';
    const [searchQuery, setSearchQuery] = useState(initialQuery);
    const [debouncedSearch, setDebouncedSearch] = useState(initialQuery);

    // Debounce search query
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchQuery);
        }, 200);
        return () => clearTimeout(handler);
    }, [searchQuery]);

    // Dialog states for Create
    const [createOpen, setCreateOpen] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [selectedWorkbookId, setSelectedWorkbookId] = useState<string>('');
    const [newWorkbookName, setNewWorkbookName] = useState('');
    const [workbookPickerOpen, setWorkbookPickerOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    // Dialog states for Rename
    const [renameOpen, setRenameOpen] = useState(false);
    const [renameTarget, setRenameTarget] = useState<DashboardSummary | null>(null);
    const [renameTitle, setRenameTitle] = useState('');
    const [isRenaming, setIsRenaming] = useState(false);

    // Single delete
    const [deleteTarget, setDeleteTarget] = useState<DashboardSummary | null>(null);
    const [isDeletingSingle, setIsDeletingSingle] = useState(false);

    // Sorting & pagination for table view
    const initialSorting = useMemo<SortingState>(() => {
        const sortParam = searchParams.get('sort');
        if (!sortParam) {
            return [{ id: 'updatedAt', desc: true }];
        }
        const delimiter = sortParam.includes(':') ? ':' : '.';
        const [col, dir] = sortParam.split(delimiter);
        const colId = col === 'modified' ? 'updatedAt' : col === 'name' ? 'title' : col;
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

    // Sync state into URL params
    const updateUrlParams = useCallback(
        (newView: 'tile' | 'table', newFilter: 'all' | 'recents' | 'favorites', search: string) => {
            const params = new URLSearchParams();
            if (newView !== 'tile') {
                params.set('view', newView);
            }
            if (newFilter !== 'all') {
                params.set('filter', newFilter);
            }
            if (search.trim()) {
                params.set('q', search.trim());
            }
            const queryStr = params.toString();
            const newUrl = queryStr ? `${pathname}?${queryStr}` : pathname;
            window.history.replaceState(null, '', newUrl);
        },
        [pathname]
    );

    // Handle view mode change
    const handleViewModeChange = (mode: 'tile' | 'table') => {
        setViewMode(mode);
        try {
            localStorage.setItem('dashboards-view-mode', mode);
        } catch {
            // ignore
        }
        updateUrlParams(mode, tabFilter, searchQuery);
    };

    // Handle tab filter change
    const handleTabFilterChange = (filter: 'all' | 'recents' | 'favorites') => {
        setTabFilter(filter);
        setPagination((prev) => ({ ...prev, pageIndex: 0 }));
        updateUrlParams(viewMode, filter, searchQuery);
    };

    // Handle search change
    const handleSearchChange = (val: string) => {
        setSearchQuery(val);
        setPagination((prev) => ({ ...prev, pageIndex: 0 }));
        updateUrlParams(viewMode, tabFilter, val);
    };

    // Fetch dashboards
    const fetchDashboardsAndWorkbooks = useCallback(async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (debouncedSearch.trim()) {
                params.set('q', debouncedSearch.trim());
            }
            if (tabFilter !== 'all') {
                params.set('filter', tabFilter);
            }

            const queryStr = params.toString();
            const [dashRes, wbRes] = await Promise.all([
                fetch(`/api/dashboards${queryStr ? `?${queryStr}` : ''}`),
                fetch('/api/workbooks'),
            ]);

            const dashJson = (await dashRes.json()) as { data?: DashboardSummary[]; error?: string };
            const wbJson = (await wbRes.json()) as { data?: WorkbookWithCounts[]; error?: string };

            if (!dashRes.ok || !dashJson.data) {
                throw new Error(dashJson.error ?? 'Failed to load dashboards');
            }

            setDashboards(dashJson.data);
            if (wbJson.data) {
                setWorkbooksList(wbJson.data);
            }
            setLoadError(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load dashboards';
            setLoadError(message);
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, tabFilter]);

    useEffect(() => {
        let active = true;
        const params = new URLSearchParams();
        if (debouncedSearch.trim()) {
            params.set('q', debouncedSearch.trim());
        }
        if (tabFilter !== 'all') {
            params.set('filter', tabFilter);
        }

        const queryStr = params.toString();
        Promise.all([
            fetch(`/api/dashboards${queryStr ? `?${queryStr}` : ''}`).then((r) => r.json()),
            fetch('/api/workbooks').then((r) => r.json()),
        ])
            .then(
                ([dashJson, wbJson]: [
                    { data?: DashboardSummary[]; error?: string },
                    { data?: WorkbookWithCounts[]; error?: string },
                ]) => {
                    if (!active) return;
                    if (!dashJson.data) {
                        throw new Error(dashJson.error ?? 'Failed to load dashboards');
                    }
                    setDashboards(dashJson.data);
                    if (wbJson.data) {
                        setWorkbooksList(wbJson.data);
                    }
                    setLoadError(null);
                }
            )
            .catch((err: unknown) => {
                if (!active) return;
                const message = err instanceof Error ? err.message : 'Failed to load dashboards';
                setLoadError(message);
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [debouncedSearch, tabFilter]);

    // Toggle favorite handler
    const handleToggleFavorite = useCallback(
        async (d: DashboardSummary) => {
            const nextFavorite = !d.isFavorite;
            // Optimistic update
            setDashboards((prev) =>
                prev.map((item) => (item.id === d.id ? { ...item, isFavorite: nextFavorite } : item))
            );

            try {
                const res = await fetch(`/api/dashboards/${d.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isFavorite: nextFavorite }),
                });
                if (!res.ok) {
                    throw new Error('Failed to update favorite');
                }
                toast.success(
                    nextFavorite
                        ? `Added "${d.title}" to favorites`
                        : `Removed "${d.title}" from favorites`
                );
                if (tabFilter === 'favorites' && !nextFavorite) {
                    void fetchDashboardsAndWorkbooks();
                }
            } catch {
                // Rollback
                setDashboards((prev) =>
                    prev.map((item) => (item.id === d.id ? { ...item, isFavorite: !nextFavorite } : item))
                );
                toast.error('Failed to update favorite status');
            }
        },
        [fetchDashboardsAndWorkbooks, tabFilter]
    );

    // Create dashboard handler
    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedTitle = newTitle.trim();
        if (!trimmedTitle) {
            toast.error('Please enter a dashboard title');
            return;
        }

        let targetWorkbookId = selectedWorkbookId;

        try {
            setIsCreating(true);

            if (targetWorkbookId === '__new__') {
                const trimmedWbName = newWorkbookName.trim();
                if (!trimmedWbName) {
                    toast.error('Please enter a workbook name');
                    setIsCreating(false);
                    return;
                }

                const createWbRes = await fetch('/api/workbooks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: trimmedWbName }),
                });
                const createWbJson = (await createWbRes.json()) as {
                    data?: WorkbookWithCounts;
                    error?: string;
                };

                if (!createWbRes.ok || !createWbJson.data) {
                    throw new Error(createWbJson.error ?? 'Failed to create new workbook');
                }

                targetWorkbookId = createWbJson.data.id;
            }

            if (!targetWorkbookId) {
                toast.error('Please select or create a workbook');
                setIsCreating(false);
                return;
            }

            const res = await fetch('/api/dashboards', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: trimmedTitle,
                    workbookId: targetWorkbookId,
                }),
            });
            const json = (await res.json()) as { data?: DashboardSummary; error?: string };

            if (!res.ok || !json.data) {
                throw new Error(json.error ?? 'Failed to create dashboard');
            }

            toast.success(`Dashboard "${trimmedTitle}" created`);
            setCreateOpen(false);
            setNewTitle('');
            setSelectedWorkbookId('');
            setNewWorkbookName('');
            router.push(`/dashboards/${json.data.id}`);
        } catch (err) {
            toast.error('Failed to create dashboard', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setIsCreating(false);
        }
    };

    // Rename dashboard handler
    const handleRename = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!renameTarget) return;
        const trimmed = renameTitle.trim();
        if (!trimmed) return;

        try {
            setIsRenaming(true);
            const res = await fetch(`/api/dashboards/${renameTarget.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: trimmed }),
            });
            const json = (await res.json()) as { data?: DashboardSummary; error?: string };
            if (!res.ok || !json.data) {
                throw new Error(json.error ?? 'Failed to rename dashboard');
            }
            toast.success('Dashboard renamed');
            setRenameOpen(false);
            setRenameTarget(null);
            await fetchDashboardsAndWorkbooks();
        } catch (err) {
            toast.error('Failed to rename dashboard', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setIsRenaming(false);
        }
    };

    // Duplicate dashboard handler
    const handleDuplicate = useCallback(
        async (d: DashboardSummary) => {
            try {
                const res = await fetch(`/api/dashboards/${d.id}/duplicate`, {
                    method: 'POST',
                });
                const json = (await res.json()) as { data?: DashboardSummary; error?: string };
                if (!res.ok || !json.data) {
                    throw new Error(json.error ?? 'Failed to duplicate dashboard');
                }
                toast.success(`"${d.title}" duplicated`);
                await fetchDashboardsAndWorkbooks();
            } catch (err) {
                toast.error('Failed to duplicate dashboard', {
                    description: err instanceof Error ? err.message : undefined,
                });
            }
        },
        [fetchDashboardsAndWorkbooks]
    );

    // Single delete handler
    const handleDeleteSingle = async () => {
        if (!deleteTarget) return;
        try {
            setIsDeletingSingle(true);
            const res = await fetch(`/api/dashboards/${deleteTarget.id}`, {
                method: 'DELETE',
            });
            if (!res.ok) {
                throw new Error('Failed to delete dashboard');
            }
            toast.success(`Dashboard "${deleteTarget.title}" deleted`);
            setDeleteTarget(null);
            await fetchDashboardsAndWorkbooks();
        } catch (err) {
            toast.error('Failed to delete dashboard', {
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setIsDeletingSingle(false);
        }
    };

    // Bulk delete handler
    const handleBulkDelete = async (selected: DashboardSummary[]) => {
        const ids = selected.map((s) => s.id);
        const res = await fetch('/api/dashboards', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
        });
        const json = (await res.json()) as { data?: { ok: boolean; count: number }; error?: string };
        if (!res.ok) {
            const errorMsg = json.error ?? 'Failed to delete dashboards';
            toast.error('Failed to delete dashboards', { description: errorMsg });
            throw new Error(errorMsg);
        }
        toast.success(`${ids.length} ${ids.length === 1 ? 'dashboard' : 'dashboards'} deleted`);
        await fetchDashboardsAndWorkbooks();
    };

    const selectedWorkbookObj = useMemo(() => {
        return workbooksList.find((wb) => wb.id === selectedWorkbookId);
    }, [workbooksList, selectedWorkbookId]);

    // Table Columns definition (Title, Workbook, Charts, Views, Modified, Favorite, Actions)
    const columns = useMemo<LegacyColumnDef<DashboardSummary, unknown>[]>(() => {
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
                id: 'favorite',
                header: '',
                cell: ({ row }) => {
                    const d = row.original;
                    return (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleToggleFavorite(d);
                            }}
                            className={cn(
                                'p-1 rounded-md transition-colors hover:bg-muted text-muted-foreground cursor-pointer',
                                d.isFavorite && 'text-red-500 hover:text-red-600'
                            )}
                            aria-label={d.isFavorite ? 'Remove favorite' : 'Add favorite'}
                        >
                            <HeartIcon
                                className={cn(
                                    'size-4 transition-colors',
                                    d.isFavorite && 'fill-current text-red-500'
                                )}
                            />
                        </button>
                    );
                },
                enableSorting: false,
                enableHiding: false,
            },
            {
                accessorKey: 'title',
                id: 'title',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
                cell: ({ row }) => {
                    const d = row.original;
                    return (
                        <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground hover:underline">
                                {d.title}
                            </span>
                        </div>
                    );
                },
                enableSorting: true,
            },
            ...(currentUser?.role === 'admin'
                ? [
                      {
                          accessorKey: 'owner',
                          id: 'owner',
                          header: ({ column }: { column: any }) => (
                              <DataTableColumnHeader column={column} title="Owner" />
                          ),
                          cell: ({ row }: { row: any }) => {
                              const d = row.original;
                              const isMe = d.ownerId === currentUser?.id;
                              const displayName = isMe ? 'You' : (d.owner?.name || d.owner?.email || 'Unknown');
                              const initials = isMe
                                  ? 'YOU'
                                  : (d.owner?.name
                                        ? d.owner.name.slice(0, 2).toUpperCase()
                                        : d.owner?.email?.slice(0, 2).toUpperCase() ?? '??');
                              return (
                                  <div className="flex items-center gap-2">
                                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                                          {initials.slice(0, 2)}
                                      </span>
                                      <span className="text-sm text-foreground truncate max-w-[120px]" title={d.owner?.name || d.owner?.email}>
                                          {displayName}
                                      </span>
                                  </div>
                              );
                          },
                          enableSorting: false,
                      } as LegacyColumnDef<DashboardSummary, unknown>,
                  ]
                : []),
            {
                accessorKey: 'workbookTitle',
                id: 'workbook',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Workbook" />,
                cell: ({ row }) => {
                    const d = row.original;
                    return (
                        <Link
                            href={`/workbooks/${d.workbookId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-1"
                        >
                            <BookOpenIcon className="size-3" />
                            <span>{d.workbookTitle}</span>
                        </Link>
                    );
                },
                enableSorting: true,
            },
            {
                accessorKey: 'chartCount',
                id: 'charts',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Charts" />,
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground font-mono">
                        {row.original.chartCount ?? 0}
                    </span>
                ),
                enableSorting: true,
            },
            {
                accessorKey: 'viewCount',
                id: 'views',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Views" />,
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground font-mono">
                        {row.original.viewCount ?? 0}
                    </span>
                ),
                enableSorting: true,
            },
            {
                accessorKey: 'updatedAt',
                id: 'modified',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Modified" />,
                cell: ({ row }) => {
                    const date = row.original.updatedAt;
                    return (
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <span className="text-xs text-muted-foreground cursor-default">
                                        {formatRelativeTime(date)}
                                    </span>
                                }
                            />
                            <TooltipContent side="top">
                                <span>{formatFullDateTime(date)}</span>
                            </TooltipContent>
                        </Tooltip>
                    );
                },
                enableSorting: true,
            },
            {
                id: 'actions',
                cell: ({ row }) => {
                    const d = row.original;
                    return (
                        <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    render={
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            className="size-7 text-muted-foreground hover:text-foreground"
                                            aria-label="Actions"
                                        />
                                    }
                                >
                                    <MoreVerticalIcon className="size-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                    <DropdownMenuItem onClick={() => router.push(`/dashboards/${d.id}`)}>
                                        <ExternalLinkIcon className="mr-2 size-3.5" />
                                        Open
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => router.push(`/workbooks/${d.workbookId}`)}>
                                        <BookOpenIcon className="mr-2 size-3.5" />
                                        Open workbook
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => {
                                            setRenameTarget(d);
                                            setRenameTitle(d.title);
                                            setRenameOpen(true);
                                        }}
                                    >
                                        <PencilIcon className="mr-2 size-3.5" />
                                        Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleDuplicate(d)}>
                                        <CopyIcon className="mr-2 size-3.5" />
                                        Duplicate
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onClick={() => setDeleteTarget(d)}
                                    >
                                        <Trash2Icon className="mr-2 size-3.5" />
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
    }, [router, handleDuplicate, handleToggleFavorite, currentUser]);

    return (
        <TooltipProvider>
            <div className="h-full min-h-0 flex flex-col gap-4 p-6 overflow-hidden">
                {/* Header row: Title + New Dashboard */}
                <div className="flex items-center justify-between shrink-0">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">Dashboards</h1>
                        <p className="text-sm text-muted-foreground">
                            View and organize dashboards across all workbooks.
                        </p>
                    </div>
                    <Button onClick={() => setCreateOpen(true)}>
                        <PlusIcon className="mr-2 size-4" />
                        New Dashboard
                    </Button>
                </div>

                {/* Toolbar: Search input + View mode toggle + Tabs filter */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
                    {/* Search */}
                    <div className="relative flex-1 max-w-sm">
                        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Search by title..."
                            className="pl-8 h-9 text-sm"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => handleSearchChange('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    {/* Tabs filter & View mode Toggle */}
                    <div className="flex items-center gap-2.5 self-end sm:self-auto">
                        {/* Tabs-style ToggleGroup filter: All, Recents, Favorites */}
                        <ToggleGroup
                            value={[tabFilter]}
                            onValueChange={(val) => {
                                const next = Array.isArray(val) ? val[val.length - 1] : val;
                                if (next && ['all', 'recents', 'favorites'].includes(next)) {
                                    handleTabFilterChange(next as 'all' | 'recents' | 'favorites');
                                }
                            }}
                            spacing={0}
                            className="border rounded-md p-0.5 bg-muted/40 h-9"
                            size="sm"
                        >
                            <ToggleGroupItem
                                value="all"
                                className="h-7 px-3 text-xs font-medium rounded-sm data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs transition-all"
                            >
                                All
                            </ToggleGroupItem>
                            <ToggleGroupItem
                                value="recents"
                                className="h-7 px-3 text-xs font-medium rounded-sm data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs transition-all gap-1.5"
                            >
                                <ClockIcon className="size-3" />
                                Recents
                            </ToggleGroupItem>
                            <ToggleGroupItem
                                value="favorites"
                                className="h-7 px-3 text-xs font-medium rounded-sm data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs transition-all gap-1.5"
                            >
                                <HeartIcon className="size-3" />
                                Favorites
                            </ToggleGroupItem>
                        </ToggleGroup>

                        {/* View mode toggle: Tile / Table */}
                        <ToggleGroup
                            value={[viewMode]}
                            onValueChange={(val) => {
                                const next = Array.isArray(val) ? val[val.length - 1] : val;
                                if (next && (next === 'tile' || next === 'table')) {
                                    handleViewModeChange(next as 'tile' | 'table');
                                }
                            }}
                            spacing={0}
                            className="border rounded-md p-0.5 bg-muted/40 h-9"
                            size="sm"
                        >
                            <ToggleGroupItem
                                value="tile"
                                className="h-7 px-2.5 text-xs font-medium rounded-sm data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs transition-all"
                                aria-label="Tile view"
                                title="Tile view"
                            >
                                <LayoutGridIcon className="size-3.5" />
                            </ToggleGroupItem>
                            <ToggleGroupItem
                                value="table"
                                className="h-7 px-2.5 text-xs font-medium rounded-sm data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs transition-all"
                                aria-label="Table view"
                                title="Table view"
                            >
                                <TableIcon className="size-3.5" />
                            </ToggleGroupItem>
                        </ToggleGroup>
                    </div>
                </div>

                {/* Error Banner */}
                {!loading && loadError && (
                    <div className="shrink-0 flex flex-col items-center justify-center p-6 border rounded-lg bg-card gap-4">
                        <Alert variant="destructive" className="max-w-md">
                            <AlertCircleIcon className="size-4" />
                            <AlertTitle>Dashboards could not be loaded</AlertTitle>
                            <AlertDescription>{loadError}</AlertDescription>
                        </Alert>
                        <Button
                            variant="outline"
                            onClick={() => {
                                void fetchDashboardsAndWorkbooks();
                            }}
                        >
                            <RefreshCwIcon className="mr-2 size-4" />
                            Retry
                        </Button>
                    </div>
                )}

                {/* Main Content Area: Tile View or Table View */}
                {(!loadError || loading) && (
                    viewMode === 'tile' ? (
                        <div className="flex-1 min-h-0 overflow-y-auto">
                            {loading ? (
                                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 pb-6">
                                    {Array.from({ length: 8 }).map((_, i) => (
                                        <div key={i} className="rounded-lg border bg-card overflow-hidden">
                                            <Skeleton className="aspect-[16/9] w-full rounded-none" />
                                            <div className="p-3.5 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <Skeleton className="h-4 w-3/5" />
                                                    <Skeleton className="h-4 w-8" />
                                                </div>
                                                <div className="flex items-center justify-between pt-1">
                                                    <Skeleton className="h-3 w-1/2" />
                                                    <Skeleton className="h-3 w-16" />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : dashboards.length === 0 ? (
                                <div className="h-full min-h-[300px] flex flex-col items-center justify-center gap-3 text-center p-8">
                                    {tabFilter === 'favorites' ? (
                                        <>
                                            <HeartIcon className="size-10 text-muted-foreground/30" />
                                            <div>
                                                <p className="text-sm font-medium">No favorites yet</p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    Click the heart icon on any dashboard to access it quickly here.
                                                </p>
                                            </div>
                                        </>
                                    ) : debouncedSearch.trim() ? (
                                        <>
                                            <SearchIcon className="size-10 text-muted-foreground/30" />
                                            <div>
                                                <p className="text-sm font-medium">No results</p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    No dashboards match &apos;{debouncedSearch}&apos;.
                                                </p>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-xs mt-1"
                                                onClick={() => handleSearchChange('')}
                                            >
                                                Clear search
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <LayoutDashboardIcon className="size-10 text-muted-foreground/30" />
                                            <div>
                                                <p className="text-sm font-medium">No dashboards yet</p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    Create your first dashboard to visualize and monitor your metrics.
                                                </p>
                                            </div>
                                            <Button size="sm" onClick={() => setCreateOpen(true)} className="mt-1">
                                                <PlusIcon className="mr-1.5 size-3.5" />
                                                New Dashboard
                                            </Button>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 pb-6">
                                    {dashboards.map((dashboard) => (
                                        <DashboardTileCard
                                            key={dashboard.id}
                                            dashboard={dashboard}
                                            onToggleFavorite={handleToggleFavorite}
                                            onOpenRename={(d) => {
                                                setRenameTarget(d);
                                                setRenameTitle(d.title);
                                                setRenameOpen(true);
                                            }}
                                            onDuplicate={handleDuplicate}
                                            onOpenDelete={(d) => setDeleteTarget(d)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <DataTable
                            className="flex-1 min-h-0"
                            columns={columns}
                            data={dashboards}
                            loading={loading}
                            hideToolbar={true}
                            sorting={sorting}
                            onSortingChange={setSorting}
                            pagination={pagination}
                            onPaginationChange={setPagination}
                            onRowClick={(d) => router.push(`/dashboards/${d.id}`)}
                            onDeleteSelected={handleBulkDelete}
                            deleteConfirmTitle="Delete selected dashboards?"
                            deleteConfirmDescription="This will permanently delete the selected dashboards. Charts in their workbooks will not be deleted."
                            emptyState={
                                <div className="flex flex-col items-center justify-center gap-3 py-10">
                                    {tabFilter === 'favorites' ? (
                                        <>
                                            <HeartIcon className="size-10 text-muted-foreground/30" />
                                            <div>
                                                <p className="text-sm font-medium">No favorites yet</p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    Click the heart icon on any dashboard to access it quickly here.
                                                </p>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <LayoutDashboardIcon className="size-10 text-muted-foreground/30" />
                                            <div>
                                                <p className="text-sm font-medium">No dashboards yet</p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    Create your first dashboard to visualize and monitor your metrics.
                                                </p>
                                            </div>
                                            <Button size="sm" onClick={() => setCreateOpen(true)} className="mt-1">
                                                <PlusIcon className="mr-1.5 size-3.5" />
                                                New Dashboard
                                            </Button>
                                        </>
                                    )}
                                </div>
                            }
                            emptySearchState={
                                <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-center">
                                    <p className="text-sm font-medium">No results</p>
                                    <p className="text-xs text-muted-foreground">
                                        No dashboards match &apos;{debouncedSearch}&apos;.
                                    </p>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="mt-2 text-xs"
                                        onClick={() => handleSearchChange('')}
                                    >
                                        Clear search
                                    </Button>
                                </div>
                            }
                        />
                    )
                )}

                {/* Create Dashboard Dialog */}
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>New Dashboard</DialogTitle>
                            <DialogDescription>
                                Create an empty dashboard inside an existing or new workbook.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCreate} className="space-y-4 pt-1">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-foreground">
                                    Dashboard Title
                                </label>
                                <Input
                                    placeholder="e.g. Sales Overview"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    autoFocus
                                    required
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-foreground">Workbook</label>
                                <Popover open={workbookPickerOpen} onOpenChange={setWorkbookPickerOpen}>
                                    <PopoverTrigger
                                        render={
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="w-full justify-between font-normal text-xs sm:text-sm h-9"
                                            />
                                        }
                                    >
                                        {selectedWorkbookId === '__new__' ? (
                                            <span className="flex items-center gap-1.5 text-primary font-medium">
                                                <PlusIcon className="size-3.5" />
                                                Create new workbook
                                            </span>
                                        ) : selectedWorkbookObj ? (
                                            <span className="truncate">{selectedWorkbookObj.name}</span>
                                        ) : (
                                            <span className="text-muted-foreground">
                                                Select a workbook...
                                            </span>
                                        )}
                                        <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50 ml-2" />
                                    </PopoverTrigger>
                                    <PopoverContent
                                        className="w-[var(--radix-popover-trigger-width)] p-0"
                                        align="start"
                                    >
                                        <Command>
                                            <CommandInput placeholder="Search workbooks..." />
                                            <CommandList className="max-h-60 p-1">
                                                <CommandEmpty className="py-2 px-3 text-xs text-muted-foreground">
                                                    No workbooks found.
                                                </CommandEmpty>
                                                <CommandGroup>
                                                    <CommandItem
                                                        value="__new__ create new workbook"
                                                        onSelect={() => {
                                                            setSelectedWorkbookId('__new__');
                                                            setWorkbookPickerOpen(false);
                                                        }}
                                                        className="text-xs flex items-center gap-1.5 cursor-pointer text-primary font-medium"
                                                    >
                                                        <PlusIcon className="size-3.5" />
                                                        Create new workbook
                                                    </CommandItem>
                                                </CommandGroup>
                                                <CommandSeparator />
                                                <CommandGroup heading="Existing Workbooks">
                                                    {workbooksList.map((wb) => (
                                                        <CommandItem
                                                            key={wb.id}
                                                            value={`${wb.name} ${wb.id}`}
                                                            onSelect={() => {
                                                                setSelectedWorkbookId(wb.id);
                                                                setWorkbookPickerOpen(false);
                                                            }}
                                                            className="text-xs flex items-center justify-between cursor-pointer"
                                                        >
                                                            <span className="truncate">{wb.name}</span>
                                                            {selectedWorkbookId === wb.id && (
                                                                <CheckIcon className="size-3.5 text-primary shrink-0" />
                                                            )}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Reveal Name Input if "Create new workbook" is chosen */}
                            {selectedWorkbookId === '__new__' && (
                                <div className="space-y-1.5 rounded-md border p-3 bg-muted/20">
                                    <label className="text-xs font-medium text-foreground">
                                        New Workbook Name
                                    </label>
                                    <Input
                                        placeholder="e.g. Operations"
                                        value={newWorkbookName}
                                        onChange={(e) => setNewWorkbookName(e.target.value)}
                                        required
                                        autoFocus
                                    />
                                </div>
                            )}

                            <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0 pt-2 flex flex-row justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setCreateOpen(false)}
                                    disabled={isCreating}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={
                                        isCreating ||
                                        !newTitle.trim() ||
                                        !selectedWorkbookId ||
                                        (selectedWorkbookId === '__new__' && !newWorkbookName.trim())
                                    }
                                >
                                    {isCreating && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                                    Create
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                {/* Rename Dashboard Dialog */}
                <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
                    <DialogContent className="sm:max-w-sm">
                        <DialogHeader>
                            <DialogTitle>Rename Dashboard</DialogTitle>
                            <DialogDescription>
                                Change the title of this dashboard.
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

                {/* Single Delete Confirmation AlertDialog */}
                <AlertDialog
                    open={deleteTarget !== null}
                    onOpenChange={(open) => {
                        if (!open) setDeleteTarget(null);
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete dashboard?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Are you sure you want to delete &quot;{deleteTarget?.title}&quot;? Charts
                                inside the workbook will remain intact.
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

function DashboardsSkeleton() {
    return (
        <div className="h-full min-h-0 flex flex-col gap-4 p-6 overflow-hidden">
            <div className="flex items-center justify-between shrink-0">
                <div className="space-y-1">
                    <Skeleton className="h-6 w-36" />
                    <Skeleton className="h-4 w-64" />
                </div>
                <Skeleton className="h-9 w-32" />
            </div>
            <div className="flex items-center justify-between gap-3 shrink-0">
                <Skeleton className="h-9 w-64" />
                <Skeleton className="h-9 w-48" />
            </div>
            <div className="flex-1 min-h-0">
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 pb-6">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="rounded-lg border bg-card overflow-hidden">
                            <Skeleton className="aspect-[16/9] w-full rounded-none" />
                            <div className="p-3.5 space-y-2">
                                <Skeleton className="h-4 w-3/5" />
                                <Skeleton className="h-3 w-1/2" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function DashboardsPage() {
    return (
        <Suspense fallback={<DashboardsSkeleton />}>
            <DashboardsContent />
        </Suspense>
    );
}
