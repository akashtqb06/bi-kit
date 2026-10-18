'use client';

import React, { useState, useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    BarChart3Icon,
    LineChartIcon,
    AreaChartIcon,
    PieChartIcon,
    HashIcon,
    TableIcon,
    SearchIcon,
} from 'lucide-react';
import type { ChartPublic } from '@src/lib/charts/service';

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    bar: BarChart3Icon,
    line: LineChartIcon,
    area: AreaChartIcon,
    pie: PieChartIcon,
    donut: PieChartIcon,
    row: BarChart3Icon,
    number: HashIcon,
    table: TableIcon,
};

export interface AddChartDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    charts: ChartPublic[];
    existingChartIds?: Set<string> | string[];
    onAddCharts?: (selectedCharts: ChartPublic[]) => void;
    onSelectChart?: (chart: ChartPublic) => void;
}

export function AddChartDialog({
    open,
    onOpenChange,
    charts,
    existingChartIds = new Set(),
    onAddCharts,
    onSelectChart,
}: AddChartDialogProps) {
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [prevOpen, setPrevOpen] = useState(open);

    if (open !== prevOpen) {
        setPrevOpen(open);
        if (open) {
            setSelectedIds(new Set());
            setSearch('');
        }
    }

    // Normalize existingChartIds set
    const existingSet = useMemo(() => {
        if (existingChartIds instanceof Set) return existingChartIds;
        return new Set(existingChartIds);
    }, [existingChartIds]);

    // Filter charts by search query
    const filteredCharts = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return charts;
        return charts.filter(
            (c) =>
                c.name.toLowerCase().includes(query) ||
                c.type.toLowerCase().includes(query)
        );
    }, [charts, search]);

    // Selectable charts (filtered and not already placed on the dashboard)
    const selectableCharts = useMemo(
        () => filteredCharts.filter((c) => !existingSet.has(c.id)),
        [filteredCharts, existingSet]
    );

    const isAllSelectableSelected =
        selectableCharts.length > 0 &&
        selectableCharts.every((c) => selectedIds.has(c.id));

    const handleToggleSelectAll = () => {
        if (isAllSelectableSelected) {
            // Deselect all selectable
            setSelectedIds((prev) => {
                const next = new Set(prev);
                selectableCharts.forEach((c) => next.delete(c.id));
                return next;
            });
        } else {
            // Select all selectable
            setSelectedIds((prev) => {
                const next = new Set(prev);
                selectableCharts.forEach((c) => next.add(c.id));
                return next;
            });
        }
    };

    const handleToggleItem = (chartId: string) => {
        if (existingSet.has(chartId)) return;
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(chartId)) {
                next.delete(chartId);
            } else {
                next.add(chartId);
            }
            return next;
        });
    };

    const handleAdd = () => {
        const chosen = charts.filter((c) => selectedIds.has(c.id));
        if (chosen.length === 0) return;

        if (onAddCharts) {
            onAddCharts(chosen);
        } else if (onSelectChart) {
            chosen.forEach((c) => onSelectChart(c));
        }

        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md gap-4 p-5">
                <DialogHeader>
                    <DialogTitle className="text-base font-semibold">Select Charts</DialogTitle>
                </DialogHeader>

                {/* Search input with "Select All (n)" button beside it */}
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                            placeholder="Search by name"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-8 text-xs pl-8 pr-3"
                            autoFocus
                        />
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleToggleSelectAll}
                        disabled={selectableCharts.length === 0}
                        className="h-8 text-xs px-2.5 shrink-0"
                    >
                        {isAllSelectableSelected ? 'Deselect All' : `Select All (${selectableCharts.length})`}
                    </Button>
                </div>

                {/* Bordered scrollable list of workbook charts */}
                <div className="border rounded-md divide-y max-h-72 overflow-y-auto bg-card">
                    {filteredCharts.length === 0 ? (
                        <div className="p-6 text-center text-xs text-muted-foreground">
                            {charts.length === 0
                                ? 'No charts in this workbook. Create one in the chart editor first.'
                                : 'No matching charts found.'}
                        </div>
                    ) : (
                        filteredCharts.map((chart) => {
                            const Icon = TYPE_ICONS[chart.type] || BarChart3Icon;
                            const isAlreadyPlaced = existingSet.has(chart.id);
                            const isChecked = isAlreadyPlaced || selectedIds.has(chart.id);

                            return (
                                <div
                                    key={chart.id}
                                    onClick={() => handleToggleItem(chart.id)}
                                    className={`flex items-center justify-between p-2.5 px-3 transition-colors ${
                                        isAlreadyPlaced
                                            ? 'opacity-60 bg-muted/20 cursor-not-allowed'
                                            : 'hover:bg-muted/40 cursor-pointer'
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0 pr-3">
                                        <div className="size-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
                                            <Icon className="size-3.5 text-primary" />
                                        </div>
                                        <div className="min-w-0 truncate">
                                            <p className="text-xs font-medium text-foreground truncate">
                                                {chart.name}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground uppercase font-mono">
                                                {chart.type}
                                                {isAlreadyPlaced && ' • Already on dashboard'}
                                            </p>
                                        </div>
                                    </div>

                                    <Checkbox
                                        checked={isChecked}
                                        disabled={isAlreadyPlaced}
                                        onCheckedChange={() => handleToggleItem(chart.id)}
                                        className="shrink-0"
                                        aria-label={`Select ${chart.name}`}
                                    />
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer: Full-width primary "Add" Button and full-width secondary "Cancel" Button */}
                <DialogFooter className="flex flex-col sm:flex-col gap-2 w-full pt-1">
                    <Button
                        type="button"
                        onClick={handleAdd}
                        disabled={selectedIds.size === 0}
                        className="w-full h-8 text-xs font-medium"
                    >
                        Add {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        className="w-full h-8 text-xs"
                    >
                        Cancel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
