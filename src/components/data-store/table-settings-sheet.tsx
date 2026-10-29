'use client';

import React, { useEffect, useState } from 'react';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { SettingsIcon, Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { DataStoreTable, DataStoreSync } from '@src/lib/db/schema/data-store';

interface TableSettingsSheetProps {
    table: DataStoreTable | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

export function TableSettingsSheet({
    table,
    open,
    onOpenChange,
    onSuccess,
}: TableSettingsSheetProps) {
    const [storeTable, setStoreTable] = useState('');
    const [schedule, setSchedule] = useState<'manual' | 'hourly' | 'daily' | 'weekly'>('manual');
    const [syncMode, setSyncMode] = useState<'full' | 'incremental'>('full');
    const [cursorColumn, setCursorColumn] = useState<string | null>(null);
    const [indexedColumns, setIndexedColumns] = useState<string[]>([]);
    const [includedColumns, setIncludedColumns] = useState<string[]>([]);

    const [history, setHistory] = useState<DataStoreSync[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [saving, setSaving] = useState(false);

    const [prevTableId, setPrevTableId] = useState<string | null>(null);
    if (table && open && table.id !== prevTableId) {
        setPrevTableId(table.id);
        setStoreTable(table.storeTable);
        setSchedule(table.schedule as 'manual' | 'hourly' | 'daily' | 'weekly');
        setSyncMode(table.syncMode as 'full' | 'incremental');
        setCursorColumn(table.cursorColumn ?? null);
        setIndexedColumns(table.indexedColumns || []);
        setIncludedColumns(table.includedColumns || table.columns.map((c) => c.name));
    }

    useEffect(() => {
        if (!table || !open) return;

        let active = true;
        (async () => {
            setLoadingHistory(true);
            try {
                const res = await fetch(`/api/data-store/tables/${table.id}/history`);
                const json = await res.json();
                if (active) setHistory(json.data || []);
            } catch {
                // ignore
            } finally {
                if (active) setLoadingHistory(false);
            }
        })();

        return () => {
            active = false;
        };
    }, [table?.id, open]);

    const handleSave = async () => {
        if (!table) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/data-store/tables/${table.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    storeTable: storeTable.trim() || table.storeTable,
                    schedule,
                    syncMode,
                    cursorColumn: syncMode === 'incremental' ? cursorColumn : null,
                    indexedColumns,
                    includedColumns,
                }),
            });

            if (!res.ok) {
                const json = await res.json();
                throw new Error(json.error?.message || 'Failed to update table settings');
            }

            toast.success('Table settings saved');
            onSuccess?.();
            onOpenChange(false);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    if (!table) return null;

    const allColumns = table.columns || [];

    const toggleIndexedColumn = (colName: string) => {
        setIndexedColumns((prev) =>
            prev.includes(colName) ? prev.filter((c) => c !== colName) : [...prev, colName]
        );
    };

    const toggleIncludedColumn = (colName: string) => {
        setIncludedColumns((prev) => {
            if (prev.includes(colName)) {
                if (prev.length <= 1) {
                    toast.warning('At least one column must remain included');
                    return prev;
                }
                return prev.filter((c) => c !== colName);
            }
            return [...prev, colName];
        });
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-[85vw] max-w-2xl sm:max-w-2xl flex flex-col p-0">
                <SheetHeader className="p-4 border-b">
                    <div className="flex items-center gap-2">
                        <SettingsIcon className="size-4 text-primary" />
                        <SheetTitle className="text-base font-semibold">Table Settings: {table.storeTable}</SheetTitle>
                    </div>
                    <SheetDescription className="text-xs">
                        Configure synchronization schedule, indexing, columns, and view history.
                    </SheetDescription>
                </SheetHeader>

                <Tabs defaultValue="general" className="flex-1 flex flex-col min-h-0">
                    <div className="px-4 border-b">
                        <TabsList className="bg-transparent h-9 p-0 space-x-4 border-b-0">
                            <TabsTrigger
                                value="general"
                                className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 text-xs"
                            >
                                General & Sync
                            </TabsTrigger>
                            <TabsTrigger
                                value="columns"
                                className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 text-xs"
                            >
                                Columns & Indexes ({allColumns.length})
                            </TabsTrigger>
                            <TabsTrigger
                                value="history"
                                className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 text-xs"
                            >
                                Sync History
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto p-4">
                        <TabsContent value="general" className="m-0 space-y-4">
                            {/* Table Name */}
                            <div className="space-y-1.5">
                                <Label htmlFor="store-table-name" className="text-xs">Store Table Name</Label>
                                <Input
                                    id="store-table-name"
                                    value={storeTable}
                                    onChange={(e) => setStoreTable(e.target.value)}
                                    className="h-8 text-xs font-mono"
                                    placeholder="table_name"
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    Physical name used inside your user schema ({table.storeSchema}).
                                </p>
                            </div>

                            {/* Schedule */}
                            <div className="space-y-1.5">
                                <Label className="text-xs">Sync Schedule</Label>
                                <Select
                                    value={schedule}
                                    onValueChange={(val) => setSchedule(val as typeof schedule)}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="manual" className="text-xs">Manual (sync on demand)</SelectItem>
                                        <SelectItem value="hourly" className="text-xs">Hourly</SelectItem>
                                        <SelectItem value="daily" className="text-xs">Daily</SelectItem>
                                        <SelectItem value="weekly" className="text-xs">Weekly</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Sync Mode */}
                            <div className="space-y-1.5">
                                <Label className="text-xs">Sync Mode</Label>
                                <Select
                                    value={syncMode}
                                    onValueChange={(val) => setSyncMode(val as typeof syncMode)}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="full" className="text-xs">Full Refresh (atomic swap)</SelectItem>
                                        <SelectItem value="incremental" className="text-xs">Incremental (upsert by cursor)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Cursor Column (if incremental) */}
                            {syncMode === 'incremental' && (
                                <div className="space-y-1.5 border p-3 rounded-md bg-muted/20">
                                    <Label className="text-xs">Cursor Column</Label>
                                    <Select
                                        value={cursorColumn || '__none__'}
                                        onValueChange={(val) => setCursorColumn(val === '__none__' ? null : val)}
                                    >
                                        <SelectTrigger className="h-8 text-xs font-mono">
                                            <SelectValue placeholder="Select column..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__none__" className="text-xs">None</SelectItem>
                                            {allColumns.map((c) => (
                                                <SelectItem key={c.name} value={c.name} className="text-xs font-mono">
                                                    {c.name} ({c.type})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[11px] text-muted-foreground">
                                        Only rows with cursor values greater than the last sync high-water mark will be fetched.
                                    </p>
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="columns" className="m-0 space-y-3">
                            <p className="text-xs text-muted-foreground">
                                Toggle column inclusion and select columns to create PostgreSQL indexes on for query speed.
                            </p>
                            <div className="rounded-md border divide-y overflow-hidden text-xs">
                                <div className="grid grid-cols-12 bg-muted/40 p-2 font-medium text-muted-foreground text-[11px]">
                                    <div className="col-span-1 text-center">Include</div>
                                    <div className="col-span-6">Column Name</div>
                                    <div className="col-span-3">Type</div>
                                    <div className="col-span-2 text-right">Index</div>
                                </div>
                                {allColumns.map((col) => {
                                    const isIncluded = includedColumns.includes(col.name);
                                    const isIndexed = indexedColumns.includes(col.name) || col.isPk;

                                    return (
                                        <div key={col.name} className="grid grid-cols-12 items-center p-2 hover:bg-muted/20">
                                            <div className="col-span-1 flex justify-center">
                                                <Checkbox
                                                    checked={isIncluded}
                                                    onCheckedChange={() => toggleIncludedColumn(col.name)}
                                                />
                                            </div>
                                            <div className="col-span-6 font-mono truncate">
                                                <span>{col.name}</span>
                                                {col.isPk && (
                                                    <Badge variant="secondary" className="ml-1.5 text-[9px] px-1 py-0 h-3.5">
                                                        PK
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="col-span-3">
                                                <Badge variant="outline" className="text-[9px] uppercase font-mono px-1 py-0 h-4">
                                                    {col.nativeType || col.type}
                                                </Badge>
                                            </div>
                                            <div className="col-span-2 flex justify-end">
                                                <Checkbox
                                                    checked={isIndexed}
                                                    disabled={col.isPk}
                                                    onCheckedChange={() => toggleIndexedColumn(col.name)}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </TabsContent>

                        <TabsContent value="history" className="m-0">
                            {loadingHistory ? (
                                <div className="space-y-2 p-2">
                                    <div className="h-7 bg-muted animate-pulse rounded" />
                                    <div className="h-7 bg-muted animate-pulse rounded" />
                                </div>
                            ) : history.length === 0 ? (
                                <div className="text-center py-8 text-xs text-muted-foreground">
                                    No synchronization history recorded yet.
                                </div>
                            ) : (
                                <div className="rounded-md border overflow-hidden">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/40 text-[11px]">
                                                <TableHead>Status</TableHead>
                                                <TableHead>Rows</TableHead>
                                                <TableHead>Trigger</TableHead>
                                                <TableHead>Started</TableHead>
                                                <TableHead>Error</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {history.map((sync) => (
                                                <TableRow key={sync.id} className="text-xs">
                                                    <TableCell>
                                                        <Badge
                                                            variant="outline"
                                                            className={
                                                                sync.status === 'success'
                                                                    ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20'
                                                                    : sync.status === 'running'
                                                                    ? 'text-blue-600 bg-blue-50 dark:bg-blue-950/20'
                                                                    : 'text-red-600 bg-red-50 dark:bg-red-950/20'
                                                            }
                                                        >
                                                            {sync.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="font-mono text-[11px]">
                                                        {sync.rowsSynced.toLocaleString()}
                                                    </TableCell>
                                                    <TableCell className="capitalize text-muted-foreground">
                                                        {sync.triggeredBy}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground whitespace-nowrap">
                                                        {format(new Date(sync.startedAt), 'MMM dd, HH:mm')}
                                                    </TableCell>
                                                    <TableCell className="max-w-[150px] truncate text-red-500 font-mono text-[10px]" title={sync.error ?? ''}>
                                                        {sync.error || '-'}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </TabsContent>
                    </div>
                </Tabs>

                <SheetFooter className="p-4 border-t flex items-center justify-between">
                    <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                        {saving && <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />}
                        Save Settings
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
