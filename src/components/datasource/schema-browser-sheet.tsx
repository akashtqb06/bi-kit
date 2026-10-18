'use client';

import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ChevronRightIcon, TableIcon, ColumnsIcon, RefreshCwIcon } from 'lucide-react';
import type { SchemaInfo, TableSchema, ColumnInfo } from '@src/lib/connectors/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SchemaBrowserSheetProps {
    dataSourceId: string | null;
    dataSourceName: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isSchemaInfo(value: unknown): value is SchemaInfo {
    if (!isRecord(value) || !Array.isArray(value.tables)) return false;
    return value.tables.every(
        (table) =>
            isRecord(table) &&
            typeof table.name === 'string' &&
            Array.isArray(table.columns) &&
            table.columns.every(
                (column) =>
                    isRecord(column) &&
                    typeof column.name === 'string' &&
                    typeof column.type === 'string' &&
                    typeof column.nullable === 'boolean'
            )
    );
}

function getApiError(value: unknown): string | null {
    return isRecord(value) && typeof value.error === 'string' ? value.error : null;
}

// ---------------------------------------------------------------------------
// Column row
// ---------------------------------------------------------------------------

function ColumnRow({ col }: { col: ColumnInfo }) {
    return (
        <div className="flex items-center gap-2 py-1 pl-8 pr-3 text-sm">
            <span className="flex-1 text-foreground">{col.name}</span>
            <Badge variant="outline" className="text-[10px] font-mono">
                {col.type}
            </Badge>
            {col.nullable && <span className="text-[10px] text-muted-foreground">null</span>}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Table collapsible
// ---------------------------------------------------------------------------

function TableCollapsible({ table }: { table: TableSchema }) {
    return (
        <Collapsible>
            <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronRightIcon className="size-3.5 text-muted-foreground transition-transform group-data-open:rotate-90" />
                <TableIcon className="size-3.5 text-muted-foreground" />
                <span className="flex-1 text-left font-medium">{table.name}</span>
                <span className="text-xs text-muted-foreground">
                    {table.columns.length} col{table.columns.length !== 1 ? 's' : ''}
                </span>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="border-l ml-5 mb-1">
                    {table.columns.map((col) => (
                        <ColumnRow key={col.name} col={col} />
                    ))}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SchemaBrowserSheet({ dataSourceId, dataSourceName, open, onOpenChange }: SchemaBrowserSheetProps) {
    const [schema, setSchema] = useState<SchemaInfo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);

    const loading = open && !!dataSourceId && !schema && !error;

    const handleOpenChange = (isOpen: boolean) => {
        if (!isOpen) {
            setSchema(null);
            setError(null);
        }
        onOpenChange(isOpen);
    };

    const retry = () => {
        setSchema(null);
        setError(null);
        setRetryCount((count) => count + 1);
    };

    useEffect(() => {
        if (!open || !dataSourceId) return;

        let cancelled = false;

        fetch(`/api/data-sources/${dataSourceId}/schema`)
            .then(async (res) => {
                const json: unknown = await res.json();
                if (cancelled) return;
                if (!res.ok) {
                    setError(getApiError(json) ?? 'Failed to load schema.');
                } else if (!isRecord(json) || !isSchemaInfo(json.data)) {
                    setError('The data source returned an invalid schema response.');
                } else {
                    setSchema(json.data);
                }
            })
            .catch(() => {
                if (!cancelled)
                    setError('Unable to reach the data source. Check that its file exists and is accessible.');
            });

        return () => {
            cancelled = true;
        };
    }, [open, dataSourceId, retryCount]);

    return (
        <Sheet open={open} onOpenChange={handleOpenChange}>
            <SheetContent side="right" className="w-80 sm:max-w-sm p-0">
                <SheetHeader className="p-4 border-b">
                    <SheetTitle className="flex items-center gap-2">
                        <ColumnsIcon className="size-4 text-muted-foreground" />
                        Schema Browser
                    </SheetTitle>
                    <SheetDescription className="truncate text-xs">{dataSourceName || '—'}</SheetDescription>
                </SheetHeader>

                <ScrollArea className="h-[calc(100vh-5rem)]">
                    <div className="py-2">
                        {loading && (
                            <div className="space-y-2 px-3 py-2">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <Skeleton key={i} className="h-8 w-full rounded-md" />
                                ))}
                            </div>
                        )}

                        {error && !loading && (
                            <div className="px-3 py-4">
                                <Alert variant="destructive">
                                    <AlertTitle>Could not load schema</AlertTitle>
                                    <AlertDescription>{error}</AlertDescription>
                                    <Button type="button" size="sm" variant="outline" className="mt-2" onClick={retry}>
                                        <RefreshCwIcon />
                                        Retry
                                    </Button>
                                </Alert>
                            </div>
                        )}

                        {!loading && !error && schema && schema.tables.length === 0 && (
                            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                                No tables found in this data source.
                            </div>
                        )}

                        {!loading && !error && schema && (
                            <div className="space-y-0.5">
                                {schema.tables.map((table) => (
                                    <TableCollapsible key={table.name} table={table} />
                                ))}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}
