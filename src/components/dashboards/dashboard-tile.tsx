'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
    MoreVerticalIcon,
    ExternalLinkIcon,
    RefreshCwIcon,
    Trash2Icon,
    AlertCircleIcon,
    DownloadIcon,
    PencilIcon,
    CopyIcon,
} from 'lucide-react';
import { ChartRenderer } from '@src/components/charts';
import { cn } from '@/lib/utils';
import { downloadChartCsv, refreshChart, openInWorkbook } from '@src/lib/chart-actions';
import type { ChartPublic } from '@src/lib/charts/service';
import type { ChartConfigData, ChartType, DashboardFilter } from '@src/lib/schemas';
import type { QueryResultData } from '@src/components/query-builder/store';

// ---------------------------------------------------------------------------
// Markdown parser for Text widgets (lightweight, zero external dependency)
// ---------------------------------------------------------------------------

function renderFormattedInline(text: string): React.ReactNode {
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return (
                <strong key={i} className="font-semibold text-foreground">
                    {part.slice(2, -2)}
                </strong>
            );
        }
        if (part.startsWith('*') && part.endsWith('*')) {
            return (
                <em key={i} className="italic">
                    {part.slice(1, -1)}
                </em>
            );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
            return (
                <code key={i} className="px-1 py-0.5 rounded bg-muted font-mono text-[11px]">
                    {part.slice(1, -1)}
                </code>
            );
        }
        return part;
    });
}

function MarkdownText({ content }: { content: string }) {
    if (!content || !content.trim()) {
        return (
            <p className="text-xs text-muted-foreground/70 italic p-1">
                Double-click to edit text...
            </p>
        );
    }
    const lines = content.split('\n');
    return (
        <div className="space-y-1 text-xs text-foreground overflow-y-auto max-h-full pr-1">
            {lines.map((line, idx) => {
                if (line.startsWith('### ')) {
                    return (
                        <h3 key={idx} className="font-semibold text-sm text-foreground">
                            {line.slice(4)}
                        </h3>
                    );
                }
                if (line.startsWith('## ')) {
                    return (
                        <h2 key={idx} className="font-semibold text-base text-foreground">
                            {line.slice(3)}
                        </h2>
                    );
                }
                if (line.startsWith('# ')) {
                    return (
                        <h1 key={idx} className="font-bold text-lg text-foreground">
                            {line.slice(2)}
                        </h1>
                    );
                }
                if (line.startsWith('- ') || line.startsWith('* ')) {
                    return (
                        <div key={idx} className="flex items-start gap-1.5 ml-2">
                            <span className="text-muted-foreground">•</span>
                            <span>{renderFormattedInline(line.slice(2))}</span>
                        </div>
                    );
                }
                if (!line.trim()) {
                    return <div key={idx} className="h-1.5" />;
                }
                return <p key={idx}>{renderFormattedInline(line)}</p>;
            })}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DashboardWidgetProps {
    itemId: string;
    widgetType?: 'chart' | 'text' | 'filter';
    chart?: ChartPublic;
    title?: string;
    text?: string;
    filter?: DashboardFilter;
    filterValue?: unknown;
    onFilterValueChange?: (filterId: string, value: unknown) => void;
    distinctValues?: string[];
    onUpdateText?: (itemId: string, text: string) => void;
    queryResult?: QueryResultData | null;
    isLoading?: boolean;
    error?: string | null;
    isEditMode: boolean;
    isSelected?: boolean;
    onSelect?: (itemId: string) => void;
    onEdit?: (itemId: string) => void;
    onOpenChart?: (chartId: string) => void;
    onRefreshQuery?: (queryId: string) => void;
    onRemoveTile: (itemId: string) => void;
    onDuplicateTile?: (itemId: string) => void;
}

// ---------------------------------------------------------------------------
// Component: DashboardWidget
// EXACT SAME DOM structure in both edit and view mode.
// ---------------------------------------------------------------------------

export function DashboardWidget({
    itemId,
    widgetType = 'chart',
    chart,
    title,
    text,
    filter,
    filterValue,
    onFilterValueChange,
    distinctValues = [],
    onUpdateText,
    queryResult,
    isLoading = false,
    error = null,
    isEditMode,
    isSelected = false,
    onSelect,
    onEdit,
    onOpenChart,
    onRefreshQuery,
    onRemoveTile,
    onDuplicateTile,
}: DashboardWidgetProps) {
    const router = useRouter();
    const [isEditingText, setIsEditingText] = useState(false);
    const [editTextValue, setEditTextValue] = useState(text || '');
    const [prevText, setPrevText] = useState(text);
    const [isRefetching, setIsRefetching] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Synchronize text state if prop changes
    if (text !== prevText) {
        setPrevText(text);
        setEditTextValue(text || '');
    }

    // Focus textarea when entering inline text edit mode
    useEffect(() => {
        if (isEditingText && textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.select();
        }
    }, [isEditingText]);

    const handleDownloadCsv = () => {
        if (!chart) return;
        void downloadChartCsv(chart, queryResult?.rows, queryResult?.columns);
    };

    const handleRefresh = async () => {
        if (!chart) return;
        setIsRefetching(true);
        try {
            await refreshChart(chart.id, async () => {
                if (onRefreshQuery && chart.queryId) {
                    await onRefreshQuery(chart.queryId);
                }
            });
        } finally {
            setIsRefetching(false);
        }
    };

    const handleOpenChart = () => {
        if (!chart) return;
        if (chart.workbookId) {
            openInWorkbook(router, chart.workbookId, chart.id);
        } else if (onOpenChart) {
            onOpenChart(chart.id);
        }
    };

    const handleTextSave = () => {
        setIsEditingText(false);
        if (onUpdateText && editTextValue !== text) {
            onUpdateText(itemId, editTextValue);
        }
    };

    const handleWidgetClick = () => {
        if (isEditMode && onSelect) {
            onSelect(itemId);
        }
    };

    const handleDoubleClick = () => {
        if (isEditMode && widgetType === 'text') {
            setIsEditingText(true);
        }
    };

    const displayTitle =
        widgetType === 'filter'
            ? filter?.name || title || 'Filter'
            : widgetType === 'text'
            ? title || ''
            : chart?.name || 'Untitled Chart';

    const chartConfig = (chart?.config || {}) as ChartConfigData;
    const chartType = (chart?.type || 'bar') as ChartType;

    // Render inner content body
    const renderBody = () => {
        if (widgetType === 'text') {
            if (isEditingText) {
                return (
                    <div className="h-full w-full pointer-events-auto">
                        <textarea
                            ref={textareaRef}
                            value={editTextValue}
                            onChange={(e) => setEditTextValue(e.target.value)}
                            onBlur={handleTextSave}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    handleTextSave();
                                }
                                if (e.key === 'Escape') {
                                    setIsEditingText(false);
                                    setEditTextValue(text || '');
                                }
                            }}
                            className="w-full h-full p-2 bg-muted/30 border border-input rounded-md resize-none outline-none focus-visible:ring-1 focus-visible:ring-ring text-xs font-mono no-drag"
                            placeholder="Write markdown text here..."
                        />
                    </div>
                );
            }
            return (
                <div
                    onDoubleClick={handleDoubleClick}
                    className="h-full w-full cursor-text overflow-hidden"
                >
                    <MarkdownText content={text || ''} />
                </div>
            );
        }

        if (widgetType === 'filter') {
            const filterColType = filter?.type || 'select';
            if (filterColType === 'date_range') {
                const rangeVal = (filterValue as { from?: string; to?: string } | undefined) || {};
                return (
                    <div className="flex flex-col gap-2 justify-center h-full no-drag pointer-events-auto">
                        <div className="grid grid-cols-2 gap-1.5">
                            <input
                                type="date"
                                value={rangeVal.from || ''}
                                onChange={(e) =>
                                    onFilterValueChange?.(filter?.id || '', {
                                        ...rangeVal,
                                        from: e.target.value || undefined,
                                    })
                                }
                                className="h-7 text-xs px-2 border rounded-md bg-background text-foreground outline-none focus:ring-1 focus:ring-ring"
                                aria-label="Start date"
                            />
                            <input
                                type="date"
                                value={rangeVal.to || ''}
                                onChange={(e) =>
                                    onFilterValueChange?.(filter?.id || '', {
                                        ...rangeVal,
                                        to: e.target.value || undefined,
                                    })
                                }
                                className="h-7 text-xs px-2 border rounded-md bg-background text-foreground outline-none focus:ring-1 focus:ring-ring"
                                aria-label="End date"
                            />
                        </div>
                    </div>
                );
            }

            // 'select' filter type
            const curSelectVal = String(filterValue ?? '__all__');
            return (
                <div className="flex flex-col justify-center h-full no-drag pointer-events-auto">
                    <select
                        value={curSelectVal}
                        onChange={(e) => {
                            const val = e.target.value;
                            onFilterValueChange?.(filter?.id || '', val === '__all__' ? undefined : val);
                        }}
                        className="h-8 w-full text-xs font-medium px-2 border rounded-md bg-background text-foreground outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                    >
                        <option value="__all__">All</option>
                        {distinctValues.map((val) => (
                            <option key={val} value={val}>
                                {val}
                            </option>
                        ))}
                    </select>
                </div>
            );
        }

        // Default: Chart
        if (!chart) {
            return (
                <div className="flex flex-col items-center justify-center h-full w-full p-4 text-center">
                    <AlertCircleIcon className="size-5 text-muted-foreground/60 mb-1" />
                    <p className="text-xs font-medium text-foreground">Chart Not Found</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                        This chart was removed from the workbook.
                    </p>
                </div>
            );
        }

        if ((isLoading || isRefetching) && !queryResult) {
            return (
                <div className="flex flex-col gap-2 p-3 h-full w-full justify-center items-center">
                    <Skeleton className="h-4 w-32 rounded" />
                    <Skeleton className="h-full w-full rounded" />
                </div>
            );
        }

        if (error) {
            return (
                <div className="flex flex-col items-center justify-center p-3 h-full w-full gap-2 text-center pointer-events-auto">
                    <Alert variant="destructive" className="p-3 text-left w-full">
                        <AlertCircleIcon className="size-4" />
                        <AlertTitle className="text-xs font-semibold">Query Error</AlertTitle>
                        <AlertDescription className="text-[11px] line-clamp-3 mt-1">
                            {error}
                        </AlertDescription>
                    </Alert>
                    {chart.queryId && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1.5 no-drag"
                            onClick={handleRefresh}
                        >
                            <RefreshCwIcon className={cn('size-3', isRefetching && 'animate-spin')} />
                            Retry
                        </Button>
                    )}
                </div>
            );
        }

        return (
            <div className="relative h-full w-full flex flex-col">
                <ChartRenderer
                    type={chartType}
                    config={chartConfig}
                    data={queryResult}
                    loading={isLoading && !queryResult}
                    error={error}
                    className="h-full w-full"
                    showTitle={false}
                />
                {(isLoading || isRefetching) && (
                    <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-20 pointer-events-none rounded-lg">
                        <RefreshCwIcon className="size-5 animate-spin text-muted-foreground" />
                    </div>
                )}
            </div>
        );
    };

    return (
        <div
            id={`widget-${itemId}`}
            data-widget-id={itemId}
            onClick={handleWidgetClick}
            className={cn(
                'group relative h-full w-full rounded-lg border bg-card transition-all overflow-visible select-none',
                isSelected ? 'ring-2 ring-foreground/20 border-foreground/30' : 'border-border',
                isEditMode && 'cursor-grab active:cursor-grabbing'
            )}
        >
            {/* ----------------------------------------------------------------- */}
            {/* Action pill: EDIT MODE ONLY, when hovered OR selected */}
            {/* Floating pill overlapping top-right edge (-top-3 right-2 z-20) */}
            {/* Dark bg-neutral-800 text-white rounded-md shadow, size-7 buttons */}
            {/* ----------------------------------------------------------------- */}
            {/* ----------------------------------------------------------------- */}
            {/* Action pill: EDIT MODE ONLY, when hovered OR selected */}
            {/* Floating pill overlapping top-right edge (-top-3 right-2 z-20) */}
            {/* Dark bg-neutral-800 text-white rounded-md shadow, size-7 buttons */}
            {/* ----------------------------------------------------------------- */}
            {isEditMode && (
                <div
                    className={cn(
                        'absolute -top-3 right-2 z-20 flex items-center bg-neutral-800 text-white rounded-md shadow-md no-drag no-export p-0.5 gap-0.5 transition-opacity',
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    )}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (widgetType === 'text') {
                                            setIsEditingText(true);
                                        } else if (onEdit) {
                                            onEdit(itemId);
                                        }
                                    }}
                                    className="size-7 flex items-center justify-center rounded hover:bg-white/10 text-white/90 hover:text-white transition-colors cursor-pointer"
                                    aria-label="Edit"
                                >
                                    <PencilIcon className="size-3.5" />
                                </button>
                            }
                        />
                        <TooltipContent side="top" className="text-xs">
                            {widgetType === 'text'
                                ? 'Edit text'
                                : widgetType === 'filter'
                                ? 'Edit filter'
                                : 'Edit chart'}
                        </TooltipContent>
                    </Tooltip>

                    {onDuplicateTile && (
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDuplicateTile(itemId);
                                        }}
                                        className="size-7 flex items-center justify-center rounded hover:bg-white/10 text-white/90 hover:text-white transition-colors cursor-pointer"
                                        aria-label="Duplicate"
                                    >
                                        <CopyIcon className="size-3.5" />
                                    </button>
                                }
                            />
                            <TooltipContent side="top" className="text-xs">
                                Duplicate widget
                            </TooltipContent>
                        </Tooltip>
                    )}

                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRemoveTile(itemId);
                                    }}
                                    className="size-7 flex items-center justify-center rounded hover:bg-white/10 text-white/90 hover:text-white transition-colors cursor-pointer"
                                    aria-label="Remove from dashboard"
                                >
                                    <Trash2Icon className="size-3.5" />
                                </button>
                            }
                        />
                        <TooltipContent side="top" className="text-xs">
                            Remove from dashboard
                        </TooltipContent>
                    </Tooltip>
                </div>
            )}

            {/* ----------------------------------------------------------------- */}
            {/* Widget Options Menu: small "⋮" menu at top-right (size-6 ghost) */}
            {/* Appears on hover in view and edit mode */}
            {/* ----------------------------------------------------------------- */}
            <div
                className={cn(
                    'absolute top-2 right-2 z-10 no-drag no-export transition-opacity',
                    isEditMode ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-100'
                )}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="size-6 text-muted-foreground hover:text-foreground cursor-pointer no-drag no-export"
                                aria-label="Widget options"
                            />
                        }
                    >
                        <MoreVerticalIcon className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 no-drag">
                        {widgetType === 'chart' && chart && (
                            <>
                                <DropdownMenuItem className="cursor-pointer text-xs" onClick={handleRefresh}>
                                    <RefreshCwIcon className={cn('mr-2 size-3.5', isRefetching && 'animate-spin')} />
                                    Refresh
                                </DropdownMenuItem>
                                <DropdownMenuItem className="cursor-pointer text-xs" onClick={handleOpenChart}>
                                    <ExternalLinkIcon className="mr-2 size-3.5" />
                                    Open in workbook
                                </DropdownMenuItem>
                                <DropdownMenuItem className="cursor-pointer text-xs" onClick={handleDownloadCsv}>
                                    <DownloadIcon className="mr-2 size-3.5" />
                                    Download CSV
                                </DropdownMenuItem>
                                {onDuplicateTile && (
                                    <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => onDuplicateTile(itemId)}>
                                        <CopyIcon className="mr-2 size-3.5" />
                                        Duplicate
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    variant="destructive"
                                    className="cursor-pointer text-xs text-destructive"
                                    onClick={() => onRemoveTile(itemId)}
                                >
                                    <Trash2Icon className="mr-2 size-3.5" />
                                    Delete
                                </DropdownMenuItem>
                            </>
                        )}
                        {widgetType === 'filter' && (
                            <>
                                <DropdownMenuItem
                                    className="cursor-pointer text-xs"
                                    onClick={() => onFilterValueChange?.(filter?.id || '', undefined)}
                                >
                                    <RefreshCwIcon className="mr-2 size-3.5" />
                                    Reset filter
                                </DropdownMenuItem>
                                {onDuplicateTile && (
                                    <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => onDuplicateTile(itemId)}>
                                        <CopyIcon className="mr-2 size-3.5" />
                                        Duplicate
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    variant="destructive"
                                    className="cursor-pointer text-xs text-destructive"
                                    onClick={() => onRemoveTile(itemId)}
                                >
                                    <Trash2Icon className="mr-2 size-3.5" />
                                    Delete
                                </DropdownMenuItem>
                            </>
                        )}
                        {widgetType === 'text' && (
                            <>
                                <DropdownMenuItem
                                    className="cursor-pointer text-xs"
                                    onClick={() => setIsEditingText(true)}
                                >
                                    <PencilIcon className="mr-2 size-3.5" />
                                    Edit
                                </DropdownMenuItem>
                                {onDuplicateTile && (
                                    <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => onDuplicateTile(itemId)}>
                                        <CopyIcon className="mr-2 size-3.5" />
                                        Duplicate
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    variant="destructive"
                                    className="cursor-pointer text-xs text-destructive"
                                    onClick={() => onRemoveTile(itemId)}
                                >
                                    <Trash2Icon className="mr-2 size-3.5" />
                                    Delete
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* ----------------------------------------------------------------- */}
            {/* Inner Wrapper: h-full overflow-hidden rounded-lg */}
            {/* ----------------------------------------------------------------- */}
            <div className="h-full w-full overflow-hidden rounded-lg flex flex-col">
                {/* Title at top-left: text-sm font-medium, px-3 pt-2.5 */}
                {displayTitle ? (
                    <div className="px-3 pt-2.5 min-w-0 pr-8 shrink-0">
                        <span
                            className={cn(
                                'text-sm font-medium truncate block select-none',
                                chartType === 'number' ? 'text-muted-foreground' : 'text-foreground'
                            )}
                            title={displayTitle}
                        >
                            {displayTitle}
                        </span>
                    </div>
                ) : null}

                {/* Chart fills the rest with p-2 */}
                <div
                    className={cn(
                        'flex-1 min-h-0 p-2 overflow-hidden flex flex-col',
                        isEditMode && widgetType !== 'text' && widgetType !== 'filter' && 'pointer-events-none'
                    )}
                >
                    {renderBody()}
                </div>
            </div>
        </div>
    );
}

// Backward compatibility aliases
export const DashboardTile = DashboardWidget;
export type DashboardTileProps = DashboardWidgetProps;
