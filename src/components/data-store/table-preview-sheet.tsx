'use client';

import React, { useEffect, useState } from 'react';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { TableIcon } from 'lucide-react';

interface TablePreviewSheetProps {
    tableId: string | null;
    tableName: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function TablePreviewSheet({
    tableId,
    tableName,
    open,
    onOpenChange,
}: TablePreviewSheetProps) {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<{
        columns: { name: string; type: string }[];
        rows: unknown[][];
    } | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !tableId) return;

        let active = true;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/data-store/tables/${tableId}/preview`);
                if (!res.ok) throw new Error('Failed to load table preview');
                const json = await res.json();
                if (active) setData(json.data || { columns: [], rows: [] });
            } catch (err) {
                if (active) setError(err instanceof Error ? err.message : 'Failed to load preview');
            } finally {
                if (active) setLoading(false);
            }
        })();

        return () => {
            active = false;
        };
    }, [open, tableId]);

    return (
        <Sheet
            open={open}
            onOpenChange={(next) => {
                if (!next) {
                    setData(null);
                    setError(null);
                }
                onOpenChange(next);
            }}
        >
            <SheetContent side="right" className="w-[85vw] max-w-4xl sm:max-w-4xl flex flex-col p-0">
                <SheetHeader className="p-4 border-b">
                    <div className="flex items-center gap-2">
                        <TableIcon className="size-4 text-primary" />
                        <SheetTitle className="text-base font-semibold">{tableName}</SheetTitle>
                    </div>
                    <SheetDescription className="text-xs">
                        Previewing first 100 rows from local Data Store storage
                    </SheetDescription>
                </SheetHeader>

                <div className="flex-1 min-h-0 overflow-auto p-4">
                    {loading ? (
                        <div className="space-y-3">
                            <Skeleton className="h-9 w-full" />
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center h-48 text-destructive text-sm">
                            {error}
                        </div>
                    ) : !data || data.rows.length === 0 ? (
                        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                            No rows available. Table may not be synchronized yet.
                        </div>
                    ) : (
                        <div className="rounded-md border overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/40">
                                        {data.columns.map((col) => (
                                            <TableHead key={col.name} className="whitespace-nowrap font-mono text-xs">
                                                <div className="flex items-center gap-1.5 py-1">
                                                    <span>{col.name}</span>
                                                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 uppercase font-sans">
                                                        {col.type}
                                                    </Badge>
                                                </div>
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.rows.map((row, rowIdx) => (
                                        <TableRow key={rowIdx}>
                                            {row.map((cell, cellIdx) => (
                                                <TableCell key={cellIdx} className="font-mono text-xs whitespace-nowrap max-w-[200px] truncate">
                                                    {cell === null || cell === undefined
                                                        ? <span className="text-muted-foreground/50 italic">null</span>
                                                        : typeof cell === 'object'
                                                        ? JSON.stringify(cell)
                                                        : String(cell)}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
