'use client';

import React, { useState, useEffect, useCallback, useMemo, useTransition } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
    DownloadIcon,
    CopyIcon,
    Loader2Icon,
    ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    captureElementPng,
    exportChartPng,
    type ExportBackground,
} from '@src/lib/chart-actions';
import { collectChartFonts } from '@src/lib/fonts';
import type { ChartConfigData } from '@src/lib/schemas';

export interface ExportChartDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    cardRef?: React.RefObject<HTMLDivElement | null>;
    getCardElement?: () => HTMLElement | null;
    chartTitle?: string;
    chartConfig?: Partial<ChartConfigData>;
}

export function ExportChartDialog({
    open,
    onOpenChange,
    cardRef,
    getCardElement,
    chartTitle,
    chartConfig,
}: ExportChartDialogProps) {
    const [scale, setScale] = useState<'1' | '2' | '3'>('2');
    const [background, setBackground] = useState<ExportBackground>('theme');
    const [includeTitle, setIncludeTitle] = useState(true);

    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [, startTransition] = useTransition();

    const fonts = useMemo(() => {
        return chartConfig ? collectChartFonts(chartConfig) : undefined;
    }, [chartConfig]);

    const getTargetElement = useCallback((): HTMLElement | null => {
        return cardRef?.current ?? getCardElement?.() ?? null;
    }, [cardRef, getCardElement]);

    // Feature detect ClipboardItem support for image/png
    const canCopy =
        typeof window !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        Boolean(navigator.clipboard && navigator.clipboard.write) &&
        typeof ClipboardItem !== 'undefined';

    // Filter to optionally exclude the chart title header
    const createFilter = useCallback(
        (withTitle: boolean) => (node: Node) => {
            if (!withTitle && node instanceof HTMLElement) {
                if (
                    node.hasAttribute('data-chart-header') ||
                    node.classList.contains('chart-card-header')
                ) {
                    return false;
                }
            }
            return true;
        },
        []
    );

    // Generate live preview when dialog is open and settings change
    useEffect(() => {
        if (!open) {
            return;
        }

        let isCancelled = false;

        const generatePreview = async () => {
            const cardEl = getTargetElement();
            if (!cardEl) return;

            setIsGeneratingPreview(true);
            try {
                const result = await captureElementPng(cardEl, {
                    pixelRatio: 1,
                    background,
                    filter: createFilter(includeTitle),
                    fonts,
                });
                if (!isCancelled && result) {
                    startTransition(() => {
                        setPreviewUrl(result.dataUrl);
                    });
                }
            } catch (err) {
                console.error('Failed to generate chart preview', err);
            } finally {
                if (!isCancelled) {
                    setIsGeneratingPreview(false);
                }
            }
        };

        void generatePreview();

        return () => {
            isCancelled = true;
        };
    }, [open, getTargetElement, background, includeTitle, createFilter, fonts]);

    const handleDownload = async () => {
        const cardEl = getTargetElement();
        if (!cardEl) return;
        setIsDownloading(true);
        try {
            await exportChartPng(
                cardEl,
                chartTitle,
                {
                    pixelRatio: Number(scale),
                    background,
                    filter: createFilter(includeTitle),
                    fonts,
                },
                chartConfig
            );
            onOpenChange(false);
        } finally {
            setIsDownloading(false);
        }
    };

    const handleCopy = async () => {
        const cardEl = getTargetElement();
        if (!cardEl) return;
        setIsCopying(true);
        try {
            const result = await captureElementPng(cardEl, {
                pixelRatio: Number(scale),
                background,
                filter: createFilter(includeTitle),
                fonts,
            });
            if (!result) throw new Error('Capture failed');

            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': result.blob }),
            ]);

            toast.success('Copied to clipboard');
            onOpenChange(false);
        } catch (err) {
            console.error('Failed to copy PNG to clipboard', err);
            toast.error('Failed to copy to clipboard');
        } finally {
            setIsCopying(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Download PNG</DialogTitle>
                    <DialogDescription>
                        Export this chart as a high-resolution PNG image.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Live Preview Area */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Preview</Label>
                        <div
                            className="relative flex items-center justify-center min-h-[160px] max-h-[220px] w-full overflow-hidden rounded-lg border bg-muted/30 p-2 shadow-inner"
                            style={{
                                backgroundImage:
                                    background === 'transparent'
                                        ? 'linear-gradient(45deg, var(--border) 25%, transparent 25%), linear-gradient(-45deg, var(--border) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--border) 75%), linear-gradient(-45deg, transparent 75%, var(--border) 75%)'
                                        : undefined,
                                backgroundSize: '16px 16px',
                                backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                            }}
                        >
                            {isGeneratingPreview && !previewUrl ? (
                                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                    <Loader2Icon className="size-5 animate-spin" />
                                    <span className="text-xs">Generating preview...</span>
                                </div>
                            ) : previewUrl ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                    src={previewUrl}
                                    alt={chartTitle || 'Chart preview'}
                                    className="max-h-[200px] w-auto max-w-full rounded object-contain shadow-xs transition-opacity duration-150"
                                />
                            ) : (
                                <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                                    <ImageIcon className="size-6 opacity-40" />
                                    <span className="text-xs">Preview unavailable</span>
                                </div>
                            )}

                            {isGeneratingPreview && previewUrl ? (
                                <div className="absolute top-2 right-2 rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-xs shadow-xs text-muted-foreground flex items-center gap-1">
                                    <Loader2Icon className="size-3 animate-spin" />
                                    Updating...
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {/* Scale (Resolution) Option */}
                    <div className="flex items-center justify-between gap-4">
                        <div className="space-y-0.5">
                            <Label className="text-xs font-medium">Scale</Label>
                            <p className="text-[11px] text-muted-foreground">
                                {scale === '1' ? 'Standard resolution (1x)' : scale === '2' ? 'High-DPI / Retina (2x)' : 'Ultra high-res for print (3x)'}
                            </p>
                        </div>
                        <ToggleGroup
                            value={[scale]}
                            onValueChange={(val) => {
                                const next = Array.isArray(val) ? val[val.length - 1] : val;
                                if (next === '1' || next === '2' || next === '3') {
                                    setScale(next);
                                }
                            }}
                            spacing={0}
                            size="sm"
                            className="border rounded-md p-0.5 bg-muted/40 shrink-0"
                            aria-label="Export Scale"
                        >
                            <ToggleGroupItem
                                value="1"
                                className="h-7 px-2.5 text-xs font-medium rounded-sm data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs transition-all"
                                aria-label="1x scale"
                            >
                                1x
                            </ToggleGroupItem>
                            <ToggleGroupItem
                                value="2"
                                className="h-7 px-2.5 text-xs font-medium rounded-sm data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs transition-all"
                                aria-label="2x scale"
                            >
                                2x
                            </ToggleGroupItem>
                            <ToggleGroupItem
                                value="3"
                                className="h-7 px-2.5 text-xs font-medium rounded-sm data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs transition-all"
                                aria-label="3x scale"
                            >
                                3x
                            </ToggleGroupItem>
                        </ToggleGroup>
                    </div>

                    {/* Background Option */}
                    <div className="flex items-center justify-between gap-4">
                        <div className="space-y-0.5">
                            <Label className="text-xs font-medium">Background</Label>
                            <p className="text-[11px] text-muted-foreground">
                                Canvas background fill
                            </p>
                        </div>
                        <ToggleGroup
                            value={[background]}
                            onValueChange={(val) => {
                                const next = Array.isArray(val) ? val[val.length - 1] : val;
                                if (next === 'theme' || next === 'white' || next === 'transparent') {
                                    setBackground(next);
                                }
                            }}
                            spacing={0}
                            size="sm"
                            className="border rounded-md p-0.5 bg-muted/40 shrink-0"
                            aria-label="Export Background"
                        >
                            <ToggleGroupItem
                                value="theme"
                                className="h-7 px-2.5 text-xs font-medium rounded-sm data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs transition-all"
                                aria-label="Theme background"
                            >
                                Theme
                            </ToggleGroupItem>
                            <ToggleGroupItem
                                value="white"
                                className="h-7 px-2.5 text-xs font-medium rounded-sm data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs transition-all"
                                aria-label="White background"
                            >
                                White
                            </ToggleGroupItem>
                            <ToggleGroupItem
                                value="transparent"
                                className="h-7 px-2.5 text-xs font-medium rounded-sm data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs transition-all"
                                aria-label="Transparent background"
                            >
                                Transparent
                            </ToggleGroupItem>
                        </ToggleGroup>
                    </div>

                    {/* Include Title Switch */}
                    <div className="flex items-center justify-between gap-4 pt-1 border-t">
                        <div className="space-y-0.5">
                            <Label htmlFor="include-title-switch" className="text-xs font-medium cursor-pointer">
                                Include title
                            </Label>
                            <p className="text-[11px] text-muted-foreground">
                                Render chart title and subtitle in the export
                            </p>
                        </div>
                        <Switch
                            id="include-title-switch"
                            checked={includeTitle}
                            onCheckedChange={setIncludeTitle}
                            aria-label="Include title in export"
                        />
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                    {canCopy && (
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleCopy}
                                        disabled={isCopying || isDownloading}
                                        className="h-8 gap-1.5 text-xs"
                                        aria-label="Copy chart PNG to clipboard"
                                    />
                                }
                            >
                                {isCopying ? (
                                    <Loader2Icon className="size-3.5 animate-spin" />
                                ) : (
                                    <CopyIcon className="size-3.5" />
                                )}
                                <span>Copy to clipboard</span>
                            </TooltipTrigger>
                            <TooltipContent side="top">Copy PNG image to clipboard</TooltipContent>
                        </Tooltip>
                    )}

                    <Button
                        type="button"
                        size="sm"
                        onClick={handleDownload}
                        disabled={isDownloading || isCopying}
                        className="h-8 gap-1.5 text-xs"
                        aria-label="Download PNG"
                    >
                        {isDownloading ? (
                            <Loader2Icon className="size-3.5 animate-spin" />
                        ) : (
                            <DownloadIcon className="size-3.5" />
                        )}
                        <span>Download</span>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
