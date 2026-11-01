'use client';

import * as React from 'react';
import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { formatInr, formatInrCompact } from './formatters';
import { cn } from '@/lib/utils';

export interface FinanceDonutItem {
  id?: string;
  name: string;
  amount: number; // in paise
  color?: string; // from categoryColorMap or theme
}

export interface FinanceDonutChartProps {
  data: FinanceDonutItem[];
  totalLabel?: string;
  height?: number | string;
  className?: string;
  emptyMessage?: string;
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
  height = 260,
  className,
  emptyMessage = 'No expenses in this period',
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

  // Top 7 plus "Others"
  const { displaySlices, othersList } = React.useMemo(() => {
    if (sortedItems.length <= 7) {
      return {
        displaySlices: sortedItems.map((item, idx) => ({
          ...item,
          key: `slice_${idx}`,
          color: item.color || DEFAULT_THEME_COLORS[idx % DEFAULT_THEME_COLORS.length],
        })),
        othersList: [],
      };
    }

    const top7 = sortedItems.slice(0, 7).map((item, idx) => ({
      ...item,
      key: `slice_${idx}`,
      color: item.color || DEFAULT_THEME_COLORS[idx % DEFAULT_THEME_COLORS.length],
    }));

    const others = sortedItems.slice(7);
    const othersTotal = others.reduce((acc, curr) => acc + curr.amount, 0);

    return {
      displaySlices: [
        ...top7,
        {
          id: 'others',
          name: 'Others',
          amount: othersTotal,
          key: 'slice_others',
          color: 'hsl(var(--muted-foreground) / 0.8)',
        },
      ],
      othersList: others,
    };
  }, [sortedItems]);

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
        style={{ height }}
      >
        <span>{emptyMessage}</span>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col sm:flex-row items-center gap-4 w-full', className)}>
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
                  <div className="rounded-lg border border-border/60 bg-background/95 backdrop-blur-xs px-3 py-2 text-xs shadow-md space-y-1">
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

                    {slice.id === 'others' && othersList.length > 0 && (
                      <div className="pt-1.5 border-t text-[10px] space-y-0.5 text-muted-foreground max-h-32 overflow-y-auto">
                        <div className="font-medium text-foreground mb-0.5">Includes:</div>
                        {othersList.map((o) => (
                          <div key={o.name} className="flex justify-between gap-2">
                            <span className="truncate max-w-[100px]">{o.name}</span>
                            <span>{formatInr(o.amount)}</span>
                          </div>
                        ))}
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

      {/* Structured Legend: sorted by amount, dot, name, amount and percent */}
      <div className="flex-1 min-w-0 w-full divide-y divide-border/50 text-xs">
        {displaySlices.map((item) => {
          const pct = totalPaise > 0 ? ((item.amount / totalPaise) * 100).toFixed(1) : '0';

          return (
            <div
              key={item.key}
              className="py-1.5 flex items-center justify-between gap-2 hover:bg-muted/30 px-1 rounded transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate font-medium text-foreground" title={item.name}>
                  {item.name}
                </span>
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
