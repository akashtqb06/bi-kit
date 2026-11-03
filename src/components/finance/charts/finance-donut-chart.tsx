'use client';

import * as React from 'react';
import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { formatInr, formatInrCompact } from './formatters';
import { cn } from '@/lib/utils';

export interface FinanceDonutItem {
  id?: string;
  categoryId?: string;
  name: string;
  amount: number; // in paise
  color?: string; // from categoryColorMap or theme
  percentage?: number;
  transactionCount?: number;
}

export interface FinanceDonutChartProps {
  data: FinanceDonutItem[];
  totalLabel?: string;
  height?: number | string;
  className?: string;
  emptyMessage?: string;
  onItemClick?: (item: FinanceDonutItem) => void;
}

const DEFAULT_THEME_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'hsl(var(--primary))',
  'hsl(var(--muted-foreground))',
  'hsl(var(--accent-foreground))',
];

export function FinanceDonutChart({
  data,
  totalLabel = 'Total Expense',
  height,
  className,
  emptyMessage = 'No expenses in this period',
  onItemClick,
}: FinanceDonutChartProps) {
  // Filter out non-positive amounts and sort descending
  const sortedItems = React.useMemo(() => {
    return (data || [])
      .filter((item) => item.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [data]);

  const totalPaise = React.useMemo(() => {
    return sortedItems.reduce((sum, item) => sum + item.amount, 0);
  }, [sortedItems]);

  // Donut slices group items under 2% into "Others" visually only
  const { displaySlices, othersList } = React.useMemo(() => {
    if (totalPaise === 0) {
      return { displaySlices: [], othersList: [] };
    }

    const mainSlices: Array<FinanceDonutItem & { key: string; color: string }> = [];
    const others: FinanceDonutItem[] = [];

    sortedItems.forEach((item, idx) => {
      const pct = item.amount / totalPaise;
      const color = item.color || DEFAULT_THEME_COLORS[idx % DEFAULT_THEME_COLORS.length];
      if (pct >= 0.02) {
        mainSlices.push({
          ...item,
          key: `slice_${item.id || item.categoryId || idx}`,
          color,
        });
      } else {
        others.push(item);
      }
    });

    if (others.length === 0) {
      return { displaySlices: mainSlices, othersList: [] };
    }

    const othersTotal = others.reduce((acc, curr) => acc + curr.amount, 0);
    const othersTxCount = others.reduce((acc, curr) => acc + (curr.transactionCount || 0), 0);

    return {
      displaySlices: [
        ...mainSlices,
        {
          id: 'others',
          categoryId: 'others',
          name: 'Others',
          amount: othersTotal,
          key: 'slice_others',
          color: 'hsl(var(--muted-foreground) / 0.8)',
          transactionCount: othersTxCount,
        },
      ],
      othersList: others,
    };
  }, [sortedItems, totalPaise]);

  const chartConfig = React.useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = {};
    for (const slice of displaySlices) {
      cfg[slice.key] = {
        label: slice.name,
        color: slice.color,
      };
    }
    return cfg;
  }, [displaySlices]);

  if (displaySlices.length === 0 || totalPaise === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground p-6 text-center',
          className
        )}
        style={{ height: height || 200 }}
      >
        <span>{emptyMessage}</span>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col md:flex-row items-center gap-5 w-full', className)}>
      {/* Donut Container with Center Total */}
      <div className="relative shrink-0 flex items-center justify-center" style={{ width: 180, height: 180 }}>
        <ChartContainer
          config={chartConfig}
          className="aspect-square w-full h-full"
        >
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const slice = payload[0].payload as (typeof displaySlices)[0];
                const pct = totalPaise > 0 ? ((slice.amount / totalPaise) * 100).toFixed(1) : '0';

                return (
                  <div className="rounded-lg border border-border/60 bg-background/95 backdrop-blur-xs px-3 py-2 text-xs shadow-md space-y-1 z-50">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: slice.color }}
                      />
                      <span className="font-semibold text-foreground">{slice.name}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 text-muted-foreground">
                      <span>{formatInr(slice.amount)}</span>
                      <span className="font-medium text-foreground">{pct}%</span>
                    </div>
                    {slice.transactionCount !== undefined && (
                      <div className="text-[10px] text-muted-foreground">
                        {slice.transactionCount} {slice.transactionCount === 1 ? 'transaction' : 'transactions'}
                      </div>
                    )}

                    {slice.id === 'others' && othersList.length > 0 && (
                      <div className="pt-1.5 border-t text-[10px] space-y-0.5 text-muted-foreground max-h-36 overflow-y-auto">
                        <div className="font-medium text-foreground mb-0.5">Includes (&lt;2% each):</div>
                        {othersList.map((o) => {
                          const oPct = totalPaise > 0 ? ((o.amount / totalPaise) * 100).toFixed(1) : '0';
                          return (
                            <div key={o.id || o.name} className="flex justify-between items-center gap-2">
                              <span className="truncate max-w-[110px]">{o.name}</span>
                              <span className="shrink-0 tabular-nums">
                                {formatInr(o.amount)} ({oPct}%)
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <Pie
              data={displaySlices}
              dataKey="amount"
              nameKey="name"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={2}
              stroke="hsl(var(--background))"
              strokeWidth={2}
              className={cn(onItemClick && 'cursor-pointer')}
              onClick={(entry) => {
                if (onItemClick && entry && entry.payload) {
                  onItemClick(entry.payload as FinanceDonutItem);
                }
              }}
            >
              {displaySlices.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>

        {/* Center Total Overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate max-w-[100px]">
            {totalLabel}
          </span>
          <span className="text-sm font-bold text-foreground tabular-nums mt-0.5">
            {formatInrCompact(totalPaise)}
          </span>
        </div>
      </div>

      {/* Structured Legend: Lists EVERY category with spend (no cap), scrollable when long */}
      <div className="flex-1 min-w-0 w-full max-h-64 overflow-y-auto divide-y divide-border/50 text-xs pr-1">
        {sortedItems.map((item, idx) => {
          const pct = totalPaise > 0 ? ((item.amount / totalPaise) * 100).toFixed(1) : '0';
          const color = item.color || DEFAULT_THEME_COLORS[idx % DEFAULT_THEME_COLORS.length];

          return (
            <div
              key={item.id || item.categoryId || item.name}
              role={onItemClick ? 'button' : undefined}
              tabIndex={onItemClick ? 0 : undefined}
              onClick={() => onItemClick?.(item)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && onItemClick) {
                  e.preventDefault();
                  onItemClick(item);
                }
              }}
              className={cn(
                'py-1.5 flex items-center justify-between gap-2 px-1 rounded transition-colors',
                onItemClick ? 'cursor-pointer hover:bg-muted/50' : 'hover:bg-muted/30'
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate font-medium text-foreground" title={item.name}>
                  {item.name}
                </span>
                {item.transactionCount !== undefined && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {`(${item.transactionCount} ${item.transactionCount === 1 ? 'txn' : 'txns'})`}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0 text-right tabular-nums">
                <span className="font-semibold text-foreground">
                  {formatInr(item.amount)}
                </span>
                <span className="text-muted-foreground text-[11px] w-10 text-right">
                  {pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
