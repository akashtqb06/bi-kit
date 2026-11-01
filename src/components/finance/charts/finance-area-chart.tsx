'use client';

import * as React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  formatInr,
  formatInrCompact,
  formatDateShort,
} from './formatters';
import { cn } from '@/lib/utils';

export interface FinanceAreaPoint {
  date: string;
  value: number; // in paise
  hasActivity?: boolean;
  [key: string]: unknown;
}

export interface FinanceAreaChartProps {
  data: FinanceAreaPoint[];
  dataKey?: string;
  label?: string;
  colorVar?: string; // CSS variable or theme key, defaults to 'var(--chart-1)'
  height?: number | string;
  className?: string;
  allowNegative?: boolean;
}

export function FinanceAreaChart({
  data,
  dataKey = 'value',
  label = 'Balance',
  colorVar = 'var(--chart-1)',
  height = 220,
  className,
  allowNegative = false,
}: FinanceAreaChartProps) {
  const chartId = React.useId().replace(/:/g, '');

  const chartConfig = React.useMemo<ChartConfig>(
    () => ({
      [dataKey]: {
        label,
        color: colorVar,
      },
    }),
    [dataKey, label, colorVar]
  );

  // Duplicate single point so area chart can draw a step line
  const chartPoints = React.useMemo(() => {
    if (!data || data.length === 0) return [];
    if (data.length === 1) {
      return [
        { ...data[0], hasActivity: true },
        { ...data[0], hasActivity: false },
      ];
    }
    return data;
  }, [data]);

  // Check if values can be negative
  const hasNegativeValues = allowNegative || chartPoints.some((p) => (Number(p[dataKey]) || 0) < 0);

  // If empty data
  if (!data || data.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground',
          className
        )}
        style={{ height }}
      >
        <span>No history data available for this range</span>
      </div>
    );
  }

  return (
    <ChartContainer
      config={chartConfig}
      className={cn('aspect-auto w-full', className)}
      style={{ height }}
    >
      <AreaChart
        data={chartPoints}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id={`gradient-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={`var(--color-${dataKey})`} stopOpacity={0.4} />
            <stop offset="95%" stopColor={`var(--color-${dataKey})`} stopOpacity={0.0} />
          </linearGradient>
        </defs>

        <CartesianGrid vertical={false} stroke="hsl(var(--border) / 0.5)" />

        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(v) => formatDateShort(String(v))}
        />

        <YAxis
          width="auto"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          domain={hasNegativeValues ? ['auto', 'auto'] : [0, 'auto']}
          tickFormatter={(v) => formatInrCompact(Number(v))}
        />

        {hasNegativeValues && (
          <ReferenceLine
            y={0}
            stroke="hsl(var(--muted-foreground) / 0.5)"
            strokeDasharray="3 3"
          />
        )}

        <ChartTooltip
          cursor={{ stroke: 'hsl(var(--muted-foreground) / 0.3)', strokeWidth: 1 }}
          content={({ active, payload, label: tipLabel }) => {
            if (!active || !payload?.length) return null;
            const item = payload[0];
            const rawVal = Number(item.value ?? 0);
            const dateStr = String(tipLabel ?? item.payload?.date ?? '');

            return (
              <div className="rounded-lg border border-border/60 bg-background/95 backdrop-blur-xs px-3 py-2 text-xs shadow-md">
                <div className="text-[11px] font-medium text-muted-foreground">
                  {formatDateShort(dateStr)}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: `var(--color-${dataKey})` }}
                  />
                  <span className="text-muted-foreground">{label}:</span>
                  <span className="font-bold text-foreground tabular-nums">
                    {formatInr(rawVal)}
                  </span>
                </div>
              </div>
            );
          }}
        />

        <Area
          type="stepAfter"
          dataKey={dataKey}
          stroke={`var(--color-${dataKey})`}
          strokeWidth={2}
          fill={`url(#gradient-${chartId})`}
          dot={(props) => {
            const hasAct = props.payload?.hasActivity;
            if (!hasAct) return <React.Fragment key={`dot-${props.index}`} />;
            return (
              <circle
                key={`dot-${props.index}`}
                cx={props.cx}
                cy={props.cy}
                r={3.5}
                fill={`var(--color-${dataKey})`}
                stroke="hsl(var(--background))"
                strokeWidth={1.5}
              />
            );
          }}
          activeDot={{
            r: 5,
            fill: `var(--color-${dataKey})`,
            stroke: 'hsl(var(--background))',
            strokeWidth: 2,
          }}
        />
      </AreaChart>
    </ChartContainer>
  );
}
