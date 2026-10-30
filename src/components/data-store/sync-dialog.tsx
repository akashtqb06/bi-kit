'use client';

import React, { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DatabaseIcon,
    HardDriveIcon,
    Loader2Icon,
    RefreshCwIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import type { DataSourcePublic } from '@src/lib/data-sources/service';

interface SyncDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialSourceId?: string | null;
    onSuccess?: () => void;
}

interface TableChoice {
    name: string;
    columnCount: number;
    rowCountEstimate?: number;
    selected: boolean;
}

interface SyncProgressItem {
    tableName: string;
    status: 'pending' | 'syncing' | 'synced' | 'error';
    rowsSynced?: number;
    error?: string;
}

export function SyncDialog({
    open,
    onOpenChange,
    initialSourceId,
    onSuccess,
}: SyncDialogProps) {
    const [dataSources, setDataSources] = useState<DataSourcePublic[]>([]);
    const [selectedSourceId, setSelectedSourceId] = useState<string>('');
    const [loadingSources, setLoadingSources] = useState(false);

    const [tables, setTables] = useState<TableChoice[]>([]);
    const [loadingSchema, setLoadingSchema] = useState(false);

    const [schedule, setSchedule] = useState<'manual' | 'hourly' | 'daily' | 'weekly'>('manual');
    const [syncMode, setSyncMode] = useState<'full' | 'incremental'>('full');

    const [progressOpen, setProgressOpen] = useState(false);
    const [progressItems, setProgressItems] = useState<SyncProgressItem[]>([]);
    const [isStarting, setIsStarting] = useState(false);

    const handleOpenChange = (newOpen: boolean) => {
        onOpenChange(newOpen);
        if (newOpen) {
            setLoadingSources(true);
        } else {
            setTables([]);
        }
    };

    const handleSourceChange = (sourceId: string) => {
        setSelectedSourceId(sourceId);
        setTables([]);
        if (sourceId) {
            setLoadingSchema(true);
        }
    };

    // Fetch data sources
    useEffect(() => {
        if (!open) return;
        let active = true;
        fetch('/api/data-sources')
            .then((res) => res.json())
            .then((json) => {
                if (!active) return;
                const list = (json.data || []).filter((d: DataSourcePublic) => d.type !== 'datastore');
                setDataSources(list);
                if (initialSourceId && list.some((d: DataSourcePublic) => d.id === initialSourceId)) {
                    setLoadingSchema(true);
                    setSelectedSourceId(initialSourceId);
                } else if (list.length > 0 && !selectedSourceId) {
                    setLoadingSchema(true);
                    setSelectedSourceId(list[0].id);
                }
            })
            .catch(() => {})
            .finally(() => {
                if (active) setLoadingSources(false);
            });
        return () => {
            active = false;
        };
    }, [open, initialSourceId, selectedSourceId]);

    // Fetch schema tables when source selected
    useEffect(() => {
        if (!selectedSourceId || !open) return;
        let active = true;
        fetch(`/api/data-sources/${selectedSourceId}/schema`)
            .then((res) => res.json())
            .then((json) => {
                if (!active) return;
                const schemaTables = (json.data?.snapshot?.tables || []).map((t: { name: string; columns?: unknown[]; rowCount?: number }) => ({
                    name: t.name,
                    columnCount: t.columns?.length || 0,
                    rowCountEstimate: t.rowCount,
                    selected: true,
                }));
                setTables(schemaTables);
            })
            .catch(() => {
                if (active) {
                    toast.error('Failed to introspect data source tables');
                    setTables([]);
                }
            })
            .finally(() => {
                if (active) setLoadingSchema(false);
            });
        return () => {
            active = false;
        };
    }, [selectedSourceId, open]);

    const handleSelectAll = (checked: boolean) => {
        setTables((prev) => prev.map((t) => ({ ...t, selected: checked })));
    };

    const handleToggleTable = (name: string) => {
        setTables((prev) =>
            prev.map((t) => (t.name === name ? { ...t, selected: !t.selected } : t))
        );
    };

    const handleStartSync = async () => {
        const chosen = tables.filter((t) => t.selected);
        if (chosen.length === 0) {
            toast.warning('Please select at least one table to sync');
            return;
        }

        setIsStarting(true);
        try {
            const res = await fetch('/api/data-store/tables', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dataSourceId: selectedSourceId,
                    tables: chosen.map((t) => ({
                        sourceTable: t.name,
                        schedule,
                        syncMode,
                    })),
                }),
            });

            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error?.message || 'Failed to initialize table synchronization');
            }

            onOpenChange(false);
            setProgressItems(
                chosen.map((t) => ({
                    tableName: t.name,
                    status: 'syncing',
                    rowsSynced: 0,
                }))
            );
            setProgressOpen(true);
            toast.success(`Started synchronizing ${chosen.length} table(s)`);
            onSuccess?.();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to start sync');
        } finally {
            setIsStarting(false);
        }
    };

    const selectedCount = tables.filter((t) => t.selected).length;

    return (
        <>
            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <div className="flex items-center gap-2">
                            <HardDriveIcon className="size-4 text-primary" />
                            <DialogTitle className="text-base">Sync Tables to Data Store</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs">
                            Select a data source and choose which tables to mirror into local PostgreSQL storage.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* 1. Source Select */}
                        <div className="space-y-1.5">
                            <Label className="text-xs">Source Data Source</Label>
                            {loadingSources ? (
                                <div className="h-8 bg-muted animate-pulse rounded" />
                            ) : (
                                <Select
                                    value={selectedSourceId}
                                    items={dataSources.map((ds) => ({ value: ds.id, label: ds.name }))}
                                    onValueChange={(val) => handleSourceChange(val || '')}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Choose data source..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {dataSources.map((ds) => (
                                            <SelectItem key={ds.id} value={ds.id} className="text-xs">
                                                <span className="flex items-center gap-2">
                                                    <DatabaseIcon className="size-3 text-muted-foreground" />
                                                    <span>{ds.name}</span>
                                                    <span className="text-[10px] text-muted-foreground uppercase font-mono">
                                                        ({ds.type})
                                                    </span>
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>

                        {/* 2. Schedule and Sync Mode */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Schedule</Label>
                                <Select
                                    value={schedule}
                                    items={[
                                        { value: 'manual', label: 'Manual' },
                                        { value: 'hourly', label: 'Hourly' },
                                        { value: 'daily', label: 'Daily' },
                                        { value: 'weekly', label: 'Weekly' },
                                    ]}
                                    onValueChange={(val) => setSchedule(val as typeof schedule)}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="manual" className="text-xs">Manual</SelectItem>
                                        <SelectItem value="hourly" className="text-xs">Hourly</SelectItem>
                                        <SelectItem value="daily" className="text-xs">Daily</SelectItem>
                                        <SelectItem value="weekly" className="text-xs">Weekly</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs">Sync Mode</Label>
                                <Select
                                    value={syncMode}
                                    items={[
                                        { value: 'full', label: 'Full Refresh' },
                                        { value: 'incremental', label: 'Incremental' },
                                    ]}
                                    onValueChange={(val) => setSyncMode(val as typeof syncMode)}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="full" className="text-xs">Full Refresh</SelectItem>
                                        <SelectItem value="incremental" className="text-xs">Incremental</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* 3. Table Checklist */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                                <Label className="text-xs">Select Tables ({selectedCount}/{tables.length})</Label>
                                {tables.length > 0 && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-[11px] px-2"
                                        onClick={() => handleSelectAll(selectedCount < tables.length)}
                                    >
                                        {selectedCount === tables.length ? 'Deselect All' : 'Select All'}
                                    </Button>
                                )}
                            </div>

                            <div className="max-h-56 overflow-y-auto border rounded-md divide-y text-xs">
                                {loadingSchema ? (
                                    <div className="p-4 flex items-center justify-center gap-2 text-muted-foreground">
                                        <Loader2Icon className="size-4 animate-spin" />
                                        <span>Discovering tables...</span>
                                    </div>
                                ) : tables.length === 0 ? (
                                    <div className="p-4 text-center text-muted-foreground">
                                        No tables found in selected data source.
                                    </div>
                                ) : (
                                    tables.map((tbl) => (
                                        <div
                                            key={tbl.name}
                                            className="flex items-center justify-between p-2 hover:bg-muted/30 cursor-pointer"
                                            onClick={() => handleToggleTable(tbl.name)}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <Checkbox
                                                    checked={tbl.selected}
                                                    onCheckedChange={() => handleToggleTable(tbl.name)}
                                                />
                                                <span className="font-mono text-xs font-medium">{tbl.name}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                                {tbl.rowCountEstimate !== undefined && (
                                                    <span>~{tbl.rowCountEstimate.toLocaleString()} rows</span>
                                                )}
                                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                                                    {tbl.columnCount} cols
                                                </Badge>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleStartSync}
                            disabled={isStarting || selectedCount === 0 || loadingSchema}
                        >
                            {isStarting && <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />}
                            Start Synchronization ({selectedCount})
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Progress Sheet */}
            <Sheet open={progressOpen} onOpenChange={setProgressOpen}>
                <SheetContent side="right" className="w-[85vw] max-w-md sm:max-w-md flex flex-col p-0">
                    <SheetHeader className="p-4 border-b">
                        <div className="flex items-center gap-2">
                            <RefreshCwIcon className="size-4 text-primary animate-spin" />
                            <SheetTitle className="text-base">Syncing Tables</SheetTitle>
                        </div>
                        <SheetDescription className="text-xs">
                            Data is currently being ingested into your local Data Store.
                        </SheetDescription>
                    </SheetHeader>

                    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                        {progressItems.map((item) => (
                            <div key={item.tableName} className="rounded-md border p-3 bg-card space-y-1.5 text-xs">
                                <div className="flex items-center justify-between font-mono font-medium">
                                    <span>{item.tableName}</span>
                                    <Badge
                                        variant="outline"
                                        className={
                                            item.status === 'synced'
                                                ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20'
                                                : item.status === 'syncing'
                                                ? 'text-blue-600 bg-blue-50 dark:bg-blue-950/20'
                                                : 'text-red-600 bg-red-50 dark:bg-red-950/20'
                                        }
                                    >
                                        {item.status === 'syncing' ? 'Syncing...' : item.status}
                                    </Badge>
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                    {item.status === 'syncing' && 'Ingesting batches into staging table...'}
                                    {item.status === 'synced' && 'Sync completed successfully.'}
                                    {item.status === 'error' && (
                                        <span className="text-red-500 font-mono text-[10px]">{item.error}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}

