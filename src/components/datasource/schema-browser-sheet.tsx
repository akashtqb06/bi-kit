'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    ChevronRightIcon,
    TableIcon,
    ColumnsIcon,
    RefreshCwIcon,
    SearchIcon,
    KeyIcon,
    HashIcon,
    CalendarIcon,
    ToggleLeftIcon,
    TypeIcon,
    Code2Icon,
    LayersIcon,
    InfoIcon,
    EyeIcon,
} from 'lucide-react';
import type { SchemaSnapshot, TableSnapshot, ColumnSnapshot, ColumnDataType } from '@src/lib/connectors/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr?: string | null): string {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        if (diffSec < 45) return 'just now';
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHour = Math.floor(diffMin / 60);
        if (diffHour < 24) return `${diffHour}h ago`;
        const diffDay = Math.floor(diffHour / 24);
        return `${diffDay}d ago`;
    } catch {
        return '';
    }
}

function formatRowCount(count?: number): string {
    if (count === undefined || count === null) return '';
    if (count >= 1_000_000) return `~${(count / 1_000_000).toFixed(1)}M rows`;
    if (count >= 1_000) return `~${(count / 1_000).toFixed(1)}k rows`;
    return `${count.toLocaleString()} rows`;
}

function getColumnIcon(type: ColumnDataType) {
    switch (type) {
        case 'number':
            return <HashIcon className="size-3 text-sky-500 shrink-0" />;
        case 'date':
            return <CalendarIcon className="size-3 text-amber-500 shrink-0" />;
        case 'boolean':
            return <ToggleLeftIcon className="size-3 text-emerald-500 shrink-0" />;
        case 'json':
            return <Code2Icon className="size-3 text-purple-500 shrink-0" />;
        case 'id':
            return <KeyIcon className="size-3 text-indigo-500 shrink-0" />;
        case 'text':
        default:
            return <TypeIcon className="size-3 text-muted-foreground shrink-0" />;
    }
}

interface SchemaBrowserSheetProps {
    dataSourceId: string | null;
    dataSourceName: string;
    dataSourceType?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Column Row
// ---------------------------------------------------------------------------

function ColumnRow({ col }: { col: ColumnSnapshot }) {
    return (
        <div className="flex items-center gap-2 py-1 pl-7 pr-3 text-xs hover:bg-muted/30 rounded transition-colors group">
            {getColumnIcon(col.type)}
            <span className="flex-1 font-mono text-[11px] text-foreground truncate">
                {col.name}
            </span>

            {col.isPrimaryKey && (
                <Badge variant="secondary" className="h-4 px-1 text-[9px] font-semibold gap-0.5 bg-amber-500/10 text-amber-600 border-amber-500/20">
                    <KeyIcon className="size-2.5" />
                    PK
                </Badge>
            )}

            <Tooltip>
                <TooltipTrigger render={
                    <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-mono lowercase cursor-help">
                        {col.type}
                    </Badge>
                } />
                <TooltipContent side="left" className="text-xs">
                    <span className="font-semibold">Native type:</span> {col.nativeType}
                </TooltipContent>
            </Tooltip>

            {col.nullable && (
                <span className="text-[10px] text-muted-foreground/70 font-mono">
                    null
                </span>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Table / View / Collection Collapsible
// ---------------------------------------------------------------------------

function TableCollapsible({
    table,
    defaultOpen = false,
}: {
    table: TableSnapshot;
    defaultOpen?: boolean;
}) {
    const isCollection = table.kind === 'collection';
    const isView = table.kind === 'view';

    return (
        <Collapsible defaultOpen={defaultOpen} className="border-b last:border-b-0">
            <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <ChevronRightIcon className="size-3.5 text-muted-foreground transition-transform group-data-open:rotate-90 shrink-0" />
                {isCollection ? (
                    <LayersIcon className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : isView ? (
                    <EyeIcon className="size-3.5 text-blue-500 shrink-0" />
                ) : (
                    <TableIcon className="size-3.5 text-muted-foreground shrink-0" />
                )}

                <span className="flex-1 text-left font-medium text-foreground truncate">
                    {table.name}
                </span>

                {isView && (
                    <Badge variant="secondary" className="h-4 px-1 text-[9px] uppercase font-normal bg-blue-500/10 text-blue-600 border-blue-500/20">
                        view
                    </Badge>
                )}
                {isCollection && (
                    <Badge variant="secondary" className="h-4 px-1 text-[9px] uppercase font-normal bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                        coll
                    </Badge>
                )}

                {table.rowCountEstimate !== undefined && table.rowCountEstimate !== null && (
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                        {formatRowCount(table.rowCountEstimate)}
                    </span>
                )}

                <span className="text-[10px] text-muted-foreground/70 font-mono shrink-0">
                    {table.columns.length} {isCollection ? 'fields' : 'cols'}
                </span>
            </CollapsibleTrigger>

            <CollapsibleContent>
                <div className="border-l ml-5 mb-1.5 space-y-0.5">
                    {table.columns.map((col) => (
                        <ColumnRow key={col.name} col={col} />
                    ))}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SchemaBrowserSheet({
    dataSourceId,
    dataSourceName,
    dataSourceType,
    open,
    onOpenChange,
}: SchemaBrowserSheetProps) {
    const [schema, setSchema] = useState<SchemaSnapshot | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSchema, setSelectedSchema] = useState<string>('all');
    const [sampleSize, setSampleSize] = useState<number>(1000);

    const isMongo = dataSourceType === 'mongodb' || schema?.tables.some((t) => t.kind === 'collection');

    const loadSchema = useCallback(
        async (refresh = false) => {
            if (!dataSourceId) return;
            if (refresh) setIsRefreshing(true);
            else setLoading(true);
            setError(null);

            try {
                const params = new URLSearchParams();
                if (refresh) params.set('refresh', '1');
                if (isMongo && sampleSize) params.set('sampleSize', String(sampleSize));

                const url = `/api/data-sources/${dataSourceId}/schema?${params.toString()}`;
                const res = await fetch(url);
                const json = (await res.json()) as { data?: SchemaSnapshot; error?: string };

                if (!res.ok || !json.data) {
                    throw new Error(json.error || 'Failed to load schema.');
                }
                setSchema(json.data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unable to introspect data source schema.');
            } finally {
                setLoading(false);
                setIsRefreshing(false);
            }
        },
        [dataSourceId, isMongo, sampleSize]
    );

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setSearchQuery('');
            setSelectedSchema('all');
        }
        onOpenChange(nextOpen);
    };

    useEffect(() => {
        if (!open || !dataSourceId) return;

        let cancelled = false;
        const timer = setTimeout(() => {
            if (!cancelled) {
                void loadSchema(false);
            }
        }, 0);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [open, dataSourceId, loadSchema]);

    // Available schemas / namespaces
    const schemaList = useMemo(() => {
        if (!schema?.schemas || schema.schemas.length <= 1) return [];
        return schema.schemas;
    }, [schema]);

    // Filtered tables based on schema tab and search query
    const filteredTables = useMemo(() => {
        if (!schema?.tables) return [];
        let list = schema.tables;

        // Filter by selected schema tab
        if (selectedSchema !== 'all') {
            list = list.filter((t) => t.schema === selectedSchema);
        }

        // Filter by search query
        const q = searchQuery.trim().toLowerCase();
        if (!q) return list;

        return list.filter((table) => {
            if (table.name.toLowerCase().includes(q)) return true;
            return table.columns.some((c) => c.name.toLowerCase().includes(q) || c.nativeType.toLowerCase().includes(q));
        });
    }, [schema, selectedSchema, searchQuery]);

    const isSearching = searchQuery.trim().length > 0;

    return (
        <Sheet open={open} onOpenChange={handleOpenChange}>
            <SheetContent side="right" className="w-88 sm:max-w-md p-0 flex flex-col h-full bg-background">
                {/* Header */}
                <SheetHeader className="p-4 border-b shrink-0 space-y-1">
                    <div className="flex items-center justify-between">
                        <SheetTitle className="flex items-center gap-2 text-base">
                            <ColumnsIcon className="size-4 text-primary" />
                            <span>Schema Browser</span>
                        </SheetTitle>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => void loadSchema(true)}
                            disabled={loading || isRefreshing}
                            title="Refresh schema cache"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        >
                            <RefreshCwIcon className={`size-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <SheetDescription className="truncate text-xs font-medium text-foreground">
                            {dataSourceName}
                        </SheetDescription>
                        {schema?.fetchedAt && (
                            <span className="text-[11px] text-muted-foreground shrink-0">
                                {formatRelativeTime(schema.fetchedAt)}
                            </span>
                        )}
                    </div>
                </SheetHeader>

                {/* MongoDB Info Banner & Sample Size Controls */}
                {isMongo && (
                    <div className="px-3 pt-3 shrink-0">
                        <Alert className="py-2 px-3 text-xs bg-muted/40 border-muted">
                            <InfoIcon className="size-3.5 text-muted-foreground shrink-0" />
                            <div className="ml-2">
                                <AlertTitle className="text-xs font-medium">Inferred Schema</AlertTitle>
                                <AlertDescription className="text-[11px] text-muted-foreground">
                                    Fields and types are inferred by sampling documents.
                                </AlertDescription>
                            </div>
                        </Alert>
                        <div className="flex items-center justify-between mt-2 px-1 text-xs text-muted-foreground">
                            <span>Sample size:</span>
                            <div className="flex items-center gap-1">
                                {[100, 500, 1000, 5000].map((size) => (
                                    <button
                                        key={size}
                                        type="button"
                                        onClick={() => {
                                            setSampleSize(size);
                                            setTimeout(() => void loadSchema(true), 10);
                                        }}
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                                            sampleSize === size
                                                ? 'bg-primary text-primary-foreground font-semibold'
                                                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                                        }`}
                                    >
                                        {size}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Search Bar */}
                <div className="p-3 pb-2 shrink-0">
                    <div className="relative">
                        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                        <Input
                            placeholder="Search tables and columns..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-8 pl-8 text-xs bg-muted/20"
                        />
                    </div>
                </div>

                {/* Schema Tabs (when multiple schemas exist, e.g. Postgres public, other) */}
                {schemaList.length > 0 && (
                    <div className="px-3 pb-2 shrink-0">
                        <Tabs value={selectedSchema} onValueChange={setSelectedSchema} className="w-full">
                            <TabsList className="h-7 w-full justify-start overflow-x-auto p-0.5 bg-muted/50">
                                <TabsTrigger value="all" className="h-6 text-[11px] px-2.5">
                                    All ({schema?.tables.length})
                                </TabsTrigger>
                                {schemaList.map((s) => (
                                    <TabsTrigger key={s} value={s} className="h-6 text-[11px] px-2.5">
                                        {s}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                    </div>
                )}

                {/* Main Content Area */}
                <ScrollArea className="flex-1 min-h-0">
                    <div className="pb-6">
                        {loading && (
                            <div className="space-y-3 p-4">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <div key={i} className="space-y-1.5">
                                        <Skeleton className="h-7 w-full rounded" />
                                        <Skeleton className="h-4 w-3/4 rounded ml-4" />
                                    </div>
                                ))}
                            </div>
                        )}

                        {error && !loading && (
                            <div className="p-4">
                                <Alert variant="destructive">
                                    <AlertTitle>Introspection Failed</AlertTitle>
                                    <AlertDescription className="text-xs mt-1">{error}</AlertDescription>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="mt-3 text-xs h-7 gap-1.5"
                                        onClick={() => void loadSchema(true)}
                                    >
                                        <RefreshCwIcon className="size-3" />
                                        Retry
                                    </Button>
                                </Alert>
                            </div>
                        )}

                        {!loading && !error && filteredTables.length === 0 && (
                            <div className="p-8 text-center text-xs text-muted-foreground">
                                {searchQuery ? 'No tables or columns match your search.' : 'No tables found in this data source.'}
                            </div>
                        )}

                        {!loading && !error && filteredTables.length > 0 && (
                            <div className="divide-y divide-border/60">
                                {filteredTables.map((table) => (
                                    <TableCollapsible
                                        key={`${table.schema ?? ''}.${table.name}`}
                                        table={table}
                                        defaultOpen={isSearching}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}
