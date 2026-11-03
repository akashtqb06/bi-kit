'use client';

import * as React from 'react';
import {
  Bar,
  ComposedChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import {
  ChartContainer,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatInrCompact, formatInr } from '../charts/formatters';
import { cn } from '@/lib/utils';

export interface EpfMonthlyPoint {
  month: string; // e.g. "2026-05"
  employee: number; // in rupees
  employer: number;
  pension: number;
  epfWages: number;
}

interface EpfContributionsChartProps {
  data: EpfMonthlyPoint[];
  height?: number;
  className?: string;
}

const chartConfig: ChartConfig = {
  employee: {
    label: 'Employee Share (12%)',
    color: '#10b981',
  },
  employer: {
    label: 'Employer Share (3.67%)',
    color: '#0284c7',
  },
  pension: {
    label: 'Pension EPS (8.33%)',
    color: '#f59e0b',
  },
  epfWages: {
    label: 'EPF Wages',
    color: '#8b5cf6',
  },
};

export function EpfContributionsChart({
  data,
  height = 260,
  className,
}: EpfContributionsChartProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground',
          className
        )}
        style={{ height }}
      >
        <span>No monthly contributions to chart for this period</span>
      </div>
    );
  }

  return (
    <ChartContainer
      config={chartConfig}
      className={cn('aspect-auto w-full', className)}
      style={{ height }}
    >
      <ComposedChart
        data={data}
        margin={{ top: 12, right: 16, left: 0, bottom: 4 }}
      >
        <CartesianGrid vertical={false} stroke="hsl(var(--border) / 0.5)" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(v) => String(v)}
        />
        <YAxis
          yAxisId="shares"
          orientation="left"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(v) => formatInrCompact(Number(v))}
        />
        <YAxis
          yAxisId="wages"
          orientation="right"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          domain={[0, 'auto']}
          tickFormatter={(v) => formatInrCompact(Number(v))}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload || payload.length === 0) return null;
            return (
              <div className="rounded-lg border bg-background p-2.5 shadow-md text-xs space-y-1 min-w-[180px]">
                <div className="font-semibold text-foreground border-b pb-1">
                  Month: {label}
                </div>
                {payload.map((entry) => {
                  const key = String(entry.dataKey);
                  const cfg = chartConfig[key];
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: cfg?.color || entry.color }}
                        />
                        {cfg?.label || key}:
                      </span>
                      <span className="font-mono font-medium text-foreground">
                        {formatInr(Number(entry.value) * 100)}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          }}
        />
        <Legend
          verticalAlign="top"
          align="right"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ paddingBottom: '8px', fontSize: '11px' }}
        />
        <Bar
          yAxisId="shares"
          dataKey="employee"
          name="Employee Share"
          stackId="shares"
          fill="#10b981"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          yAxisId="shares"
          dataKey="employer"
          name="Employer Share"
          stackId="shares"
          fill="#0284c7"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          yAxisId="shares"
          dataKey="pension"
          name="Pension Share (EPS)"
          stackId="shares"
          fill="#f59e0b"
          radius={[4, 4, 0, 0]}
        />
        <Line
          yAxisId="wages"
          type="monotone"
          dataKey="epfWages"
          name="EPF Wages"
          stroke="#8b5cf6"
          strokeWidth={2}
          dot={{ r: 3, fill: '#8b5cf6' }}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
