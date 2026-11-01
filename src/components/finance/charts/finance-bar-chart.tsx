'use client';

import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  formatInr,
  formatInrCompact,
  formatDateShort,
} from './formatters';
import { cn } from '@/lib/utils';

export interface FinanceBarSeries {
  dataKey: string;
  label: string;
  colorVar: string; // e.g. "var(--chart-1)" or "var(--chart-2)"
}

export interface FinanceBarChartProps {
  data: Array<Record<string, unknown>>;
  xAxisKey?: string;
  series: FinanceBarSeries[];
  height?: number | string;
  className?: string;
  showLegend?: boolean;
}

export function FinanceBarChart({
  data,
  xAxisKey = 'date',
  series,
  height = 240,
  className,
  showLegend = true,
}: FinanceBarChartProps) {
  const chartConfig = React.useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = {};
    for (const s of series) {
      cfg[s.dataKey] = {
        label: s.label,
        color: s.colorVar,
      };
    }
    return cfg;
  }, [series]);

  if (!data || data.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground',
          className
        )}
        style={{ height }}
      >
        <span>No bar data available for this range</span>
      </div>
    );
  }

  return (
    <ChartContainer
      config={chartConfig}
      className={cn('aspect-auto w-full', className)}
      style={{ height }}
    >
      <BarChart
        data={data}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
      >
        <CartesianGrid vertical={false} stroke="hsl(var(--border) / 0.5)" />

        <XAxis
          dataKey={xAxisKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={20}
          tickFormatter={(v) => formatDateShort(String(v))}
        />

        <YAxis
          width="auto"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          domain={[0, 'auto']}
          tickFormatter={(v) => formatInrCompact(Number(v))}
        />

        <ChartTooltip
          content={({ active, payload, label: tipLabel }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-lg border border-border/60 bg-background/95 backdrop-blur-xs px-3 py-2 text-xs shadow-md space-y-1.5">
                <div className="text-[11px] font-medium text-muted-foreground">
                  {formatDateShort(String(tipLabel))}
                </div>
                {payload.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-muted-foreground">{item.name}:</span>
                    </div>
                    <span className="font-bold text-foreground tabular-nums">
                      {formatInr(Number(item.value ?? 0))}
                    </span>
                  </div>
                ))}
              </div>
            );
          }}
        />

        {showLegend && <ChartLegend content={<ChartLegendContent />} />}

        {series.map((s) => (
          <Bar
            key={s.dataKey}
            dataKey={s.dataKey}
            fill={`var(--color-${s.dataKey})`}
            radius={[4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
