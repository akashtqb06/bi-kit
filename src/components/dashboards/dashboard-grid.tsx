'use client';

import React from 'react';
import { ReactGridLayout } from 'react-grid-layout/legacy';
import { useContainerWidth } from 'react-grid-layout';

import { DashboardWidget } from './dashboard-tile';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LayoutDashboardIcon, PlusIcon, PencilIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChartPublic } from '@src/lib/charts/service';
import type { LayoutItem, DashboardFilter } from '@src/lib/schemas';
import type { QueryCacheItem } from './use-query-cache';

// ---------------------------------------------------------------------------
// Constants
// Fixed 12-column grid and row height 60px
// ---------------------------------------------------------------------------

export const COLS = 12;
export const ROW_HEIGHT = 60;
export const GRID_MARGIN: [number, number] = [8, 8];
export const GRID_PADDING: [number, number] = [0, 0];

// ---------------------------------------------------------------------------
// Layout Sanitizer: Clamps dimensions, resolves overlaps, and applies vertical compaction
// ---------------------------------------------------------------------------

export function sanitizeLayout(items: LayoutItem[]): LayoutItem[] {
    if (!items || items.length === 0) return [];

    // 1. Clamp min/max dimensions and grid boundaries
    const clamped = items.map((item) => {
        const minW = item.widgetType === 'filter' ? 2 : item.widgetType === 'text' ? 2 : 2;
        const minH = item.widgetType === 'filter' ? 1 : item.widgetType === 'text' ? 1 : 2;
        const w = Math.max(minW, Math.min(COLS, Math.floor(item.w || 2)));
        const h = Math.max(minH, Math.floor(item.h || 2));
        const x = Math.max(0, Math.min(COLS - w, Math.floor(item.x || 0)));
        const y = Math.max(0, Math.floor(item.y || 0));
        return { ...item, x, y, w, h };
    });

    // 2. Sort items primarily by y ascending, then x ascending
    clamped.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));

    // 3. Collision resolution & vertical compaction:
    // Find lowest y >= 0 where candidate doesn't collide with previously placed items
    const placed: LayoutItem[] = [];

    for (const current of clamped) {
        const candidate = { ...current };
        let bestY = 0;
        for (const other of placed) {
            const xCollides = candidate.x < other.x + other.w && candidate.x + candidate.w > other.x;
            if (xCollides) {
                bestY = Math.max(bestY, other.y + other.h);
            }
        }
        candidate.y = bestY;
        placed.push(candidate);
    }

    return placed;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DashboardGridProps {
    items: LayoutItem[];
    chartsMap: Map<string, ChartPublic>;
    filtersMap?: Map<string, DashboardFilter>;
    filterValues?: Record<string, unknown>;
    onFilterValueChange?: (filterId: string, value: unknown) => void;
    distinctValuesMap?: Record<string, string[]>;
    cache: Record<string, QueryCacheItem>;
    isEditMode: boolean;
    selectedWidgetId?: string | null;
    onSelectWidget?: (widgetId: string | null) => void;
    onEditWidget?: (widgetId: string) => void;
    onUpdateText?: (itemId: string, text: string) => void;
    onLayoutChange: (newItems: LayoutItem[]) => void;
    onOpenChart: (chartId: string) => void;
    onRefreshQuery: (queryId: string) => void;
    onRemoveTile: (itemId: string) => void;
    onDuplicateTile?: (itemId: string) => void;
    onAddChartClick?: () => void;
    onEditInWorkbook?: () => void;
    emptyState?: React.ReactNode;
}

export function DashboardGrid({
    items,
    chartsMap,
    filtersMap,
    filterValues,
    onFilterValueChange,
    distinctValuesMap,
    cache,
    isEditMode,
    selectedWidgetId,
    onSelectWidget,
    onEditWidget,
    onUpdateText,
    onLayoutChange,
    onOpenChart,
    onRefreshQuery,
    onRemoveTile,
    onDuplicateTile,
    onAddChartClick,
    onEditInWorkbook,
    emptyState,
}: DashboardGridProps) {
    const { width, containerRef, mounted } = useContainerWidth();

    // Handle layout adjustments from react-grid-layout
    const handleGridChange = (newLayout: readonly LayoutItem[]) => {
        if (!isEditMode) return;
        let hasDifferences = false;
        const updated = items.map((item) => {
            const match = newLayout.find((l) => l.i === item.i);
            if (
                match &&
                (match.x !== item.x || match.y !== item.y || match.w !== item.w || match.h !== item.h)
            ) {
                hasDifferences = true;
                return {
                    ...item,
                    x: match.x,
                    y: match.y,
                    w: match.w,
                    h: match.h,
                };
            }
            return item;
        });

        if (hasDifferences) {
            onLayoutChange(updated);
        }
    };

    // Empty state when dashboard has no widgets
    if (items.length === 0) {
        if (emptyState) return <>{emptyState}</>;

        return (
            <div className="flex h-full min-h-[400px] items-center justify-center p-8">
                <Card className="max-w-md w-full text-center border-dashed">
                    <CardContent className="flex flex-col items-center gap-3 py-12">
                        <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <LayoutDashboardIcon className="size-6 text-primary" />
                        </div>
                        <div>
                            <p className="font-semibold text-base">
                                {isEditMode ? 'Dashboard is Empty' : 'This dashboard has no charts'}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                                {isEditMode
                                    ? 'Add charts, filters, or text widgets to your grid to start designing your dashboard.'
                                    : 'Switch to the workbook editor to add charts to this dashboard.'}
                            </p>
                        </div>
                        {isEditMode && onAddChartClick && (
                            <Button size="sm" onClick={onAddChartClick} className="mt-2 gap-1.5 text-xs">
                                <PlusIcon className="size-3.5" />
                                Add First Chart
                            </Button>
                        )}
                        {!isEditMode && onEditInWorkbook && (
                            <Button size="sm" onClick={onEditInWorkbook} className="mt-2 gap-1.5 text-xs">
                                <PencilIcon className="size-3.5" />
                                Edit in workbook
                            </Button>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="w-full min-h-0"
            onClick={(e) => {
                // Clicking on empty grid space clears selection
                if (e.target === e.currentTarget && onSelectWidget) {
                    onSelectWidget(null);
                }
            }}
        >
            {mounted && width > 0 && (
                <ReactGridLayout
                    width={width}
                    layout={items}
                    cols={COLS}
                    rowHeight={ROW_HEIGHT}
                    margin={GRID_MARGIN}
                    containerPadding={GRID_PADDING}
                    compactType="vertical"
                    preventCollision={false}
                    isDraggable={isEditMode}
                    isResizable={isEditMode}
                    draggableCancel=".no-drag, button, a, input, select, textarea, [role=menuitem]"
                    resizeHandles={['se']}
                    onLayoutChange={handleGridChange}
                    onDragStart={(_layout, _oldItem, newItem) => {
                        if (newItem?.i && onSelectWidget) {
                            onSelectWidget(newItem.i);
                        }
                    }}
                >
                    {items.map((item) => {
                        const chart = item.chartId ? chartsMap.get(item.chartId) : undefined;
                        const filter = item.filterId && filtersMap ? filtersMap.get(item.filterId) : undefined;
                        const cacheItem = chart?.queryId ? cache[chart.queryId] : undefined;
                        const isSelected = selectedWidgetId === item.i;

                        return (
                            <div
                                key={item.i}
                                className={cn('h-full w-full', isSelected && 'is-selected')}
                                onClick={(e) => {
                                    // Stop click from bubbling to grid container
                                    e.stopPropagation();
                                    if (isEditMode && onSelectWidget) {
                                        onSelectWidget(item.i);
                                    }
                                }}
                            >
                                <DashboardWidget
                                    itemId={item.i}
                                    widgetType={item.widgetType || (item.chartId ? 'chart' : item.filterId ? 'filter' : 'text')}
                                    chart={chart}
                                    title={item.title}
                                    text={item.text}
                                    filter={filter}
                                    filterValue={filter ? filterValues?.[filter.id] : undefined}
                                    onFilterValueChange={onFilterValueChange}
                                    distinctValues={filter ? distinctValuesMap?.[filter.column] || [] : []}
                                    onUpdateText={onUpdateText}
                                    queryResult={cacheItem?.data}
                                    isLoading={cacheItem?.loading ?? false}
                                    error={cacheItem?.error}
                                    isEditMode={isEditMode}
                                    isSelected={isSelected}
                                    onSelect={() => onSelectWidget?.(item.i)}
                                    onEdit={() => onEditWidget?.(item.i)}
                                    onOpenChart={onOpenChart}
                                    onRefreshQuery={onRefreshQuery}
                                    onRemoveTile={onRemoveTile}
                                    onDuplicateTile={onDuplicateTile}
                                />
                            </div>
                        );
                    })}
                </ReactGridLayout>
            )}
        </div>
    );
}
