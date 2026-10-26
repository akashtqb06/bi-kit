'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { getFontFamily } from '@src/lib/fonts';
import { normalizeTextStyle, type NormalizedChartTextStyle, type ChartTextStyle, type ChartConfigData } from '@src/lib/schemas';

export interface ChartTitleProps {
    title?: string | null;
    subtitle?: string | null;
    description?: string | null;
    textStyle?: NormalizedChartTextStyle | ChartTextStyle | Partial<ChartConfigData> | null;
    className?: string;
    compact?: boolean;
}

const FONT_WEIGHT_MAP: Record<string, number> = {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
};

export function ChartTitle({
    title,
    subtitle,
    description,
    textStyle,
    className,
    compact = false,
}: ChartTitleProps) {
    const normalized = React.useMemo(() => {
        if (!textStyle) return normalizeTextStyle(null);
        if ('title' in textStyle && typeof (textStyle as NormalizedChartTextStyle).title?.fontSize === 'number' && typeof (textStyle as NormalizedChartTextStyle).title?.show === 'boolean') {
            return textStyle as NormalizedChartTextStyle;
        }
        return normalizeTextStyle(textStyle as Partial<ChartConfigData>);
    }, [textStyle]);

    if (!normalized.title.show) {
        return null;
    }

    const effectiveTitle = title !== undefined && title !== null ? String(title) : '';
    const effectiveSubtitle = subtitle || normalized.subtitle.text || description || '';

    if (!effectiveTitle && !effectiveSubtitle) {
        return null;
    }

    const alignClass =
        normalized.title.align === 'center'
            ? 'items-center text-center justify-center'
            : normalized.title.align === 'right'
            ? 'items-end text-right justify-end'
            : 'items-start text-left justify-start';

    const titleFamily = getFontFamily(normalized.title.fontFamily);
    const subtitleFamily = getFontFamily(normalized.subtitle.fontFamily);
    const titleWeight = FONT_WEIGHT_MAP[normalized.title.fontWeight] || 500;

    // For compact dashboard widgets, ensure the title stays within the title row
    const effectiveTitleSize = compact
        ? Math.min(normalized.title.fontSize, 20)
        : normalized.title.fontSize;
    const effectiveSubtitleSize = compact
        ? Math.min(normalized.subtitle.fontSize, 12)
        : normalized.subtitle.fontSize;

    return (
        <div
            data-slot="chart-title-block"
            className={cn(
                'flex flex-col min-w-0 w-full select-none',
                alignClass,
                compact ? 'overflow-hidden max-h-12' : 'gap-0.5',
                className
            )}
        >
            {effectiveTitle && (
                <div
                    data-slot="chart-title"
                    className={cn(
                        'truncate max-w-full leading-tight text-foreground tracking-tight',
                        compact && 'truncate block'
                    )}
                    style={{
                        fontFamily: titleFamily,
                        fontSize: `${effectiveTitleSize}px`,
                        fontWeight: titleWeight,
                        color: normalized.title.color || undefined,
                        textAlign: normalized.title.align,
                    }}
                    title={effectiveTitle}
                >
                    {effectiveTitle}
                </div>
            )}
            {effectiveSubtitle && (
                <div
                    data-slot="chart-subtitle"
                    className={cn(
                        'truncate max-w-full leading-tight text-muted-foreground',
                        compact && 'text-[11px] truncate block'
                    )}
                    style={{
                        fontFamily: subtitleFamily,
                        fontSize: `${effectiveSubtitleSize}px`,
                        color: normalized.subtitle.color || undefined,
                        textAlign: normalized.title.align,
                    }}
                    title={effectiveSubtitle}
                >
                    {effectiveSubtitle}
                </div>
            )}
        </div>
    );
}

