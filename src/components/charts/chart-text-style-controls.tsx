'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectGroup,
    SelectItem,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
    AlignLeftIcon,
    AlignCenterIcon,
    AlignRightIcon,
    RotateCcwIcon,
    MinusIcon,
    PlusIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FONT_OPTIONS, loadFont } from '@src/lib/fonts';
import {
    type ChartConfigData,
    type ChartType,
    type ChartTextStyle,
    type ChartFontWeight,
    type ChartTextAlign,
    normalizeTextStyle,
} from '@src/lib/schemas';

export interface ChartTextStyleControlsProps {
    chartType: ChartType;
    config: ChartConfigData;
    onUpdateTextStyle: (patch: Partial<ChartTextStyle>) => void;
}

const PRESET_OPTIONS = [
    { value: 'compact', label: 'Compact' },
    { value: 'default', label: 'Default' },
    { value: 'presentation', label: 'Presentation' },
];

const THEME_SWATCHES = [
    { label: 'Foreground', value: 'var(--foreground)' },
    { label: 'Muted', value: 'var(--muted-foreground)' },
    { label: 'Primary', value: 'var(--primary)' },
    { label: 'Chart 1', value: 'var(--chart-1)' },
    { label: 'Chart 2', value: 'var(--chart-2)' },
    { label: 'Chart 3', value: 'var(--chart-3)' },
    { label: 'Chart 4', value: 'var(--chart-4)' },
    { label: 'Chart 5', value: 'var(--chart-5)' },
    { label: 'Black', value: '#000000' },
    { label: 'White', value: '#ffffff' },
    { label: 'Blue', value: '#3b82f6' },
    { label: 'Emerald', value: '#10b981' },
    { label: 'Amber', value: '#f59e0b' },
    { label: 'Rose', value: '#ef4444' },
];

// ---------------------------------------------------------------------------
// Sub-control: FontSizeStepper
// ---------------------------------------------------------------------------
function FontSizeStepper({
    value,
    min,
    max,
    onChange,
}: {
    value: number;
    min: number;
    max: number;
    onChange: (val: number) => void;
}) {
    const handleStep = (delta: number) => {
        const next = Math.min(Math.max(value + delta, min), max);
        onChange(next);
    };

    return (
        <div className="flex items-center gap-2 w-full">
            <div className="flex-1 min-w-0">
                <Slider
                    value={[value]}
                    min={min}
                    max={max}
                    step={1}
                    onValueChange={(val) => onChange(val)}
                />
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-6 h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={() => handleStep(-1)}
                    disabled={value <= min}
                    aria-label="Decrease font size"
                >
                    <MinusIcon className="size-3" />
                </Button>
                <Input
                    type="number"
                    value={value}
                    min={min}
                    max={max}
                    onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10);
                        if (!isNaN(parsed)) {
                            onChange(Math.min(Math.max(parsed, min), max));
                        }
                    }}
                    className="h-6 w-11 px-1 py-0 text-center font-mono text-xs tabular-nums"
                />
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-6 h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={() => handleStep(1)}
                    disabled={value >= max}
                    aria-label="Increase font size"
                >
                    <PlusIcon className="size-3" />
                </Button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Sub-control: FontPicker
// ---------------------------------------------------------------------------
function FontPicker({
    value,
    onChange,
}: {
    value: string;
    onChange: (val: string) => void;
}) {
    return (
        <Select
            value={value || 'inherit'}
            onValueChange={(val) => {
                if (val) {
                    onChange(val);
                    void loadFont(val);
                }
            }}
            items={FONT_OPTIONS.map((f) => ({ value: f.id, label: f.label }))}
        >
            <SelectTrigger className="h-7 text-xs w-full">
                <SelectValue placeholder="Select font..." />
            </SelectTrigger>
            <SelectContent className="max-h-64">
                <SelectGroup>
                    {FONT_OPTIONS.map((f) => (
                        <SelectItem
                            key={f.id}
                            value={f.id}
                            className="text-xs cursor-pointer"
                            style={{ fontFamily: f.cssFamily }}
                        >
                            {f.label}
                        </SelectItem>
                    ))}
                </SelectGroup>
            </SelectContent>
        </Select>
    );
}

// ---------------------------------------------------------------------------
// Sub-control: ColorPicker
// ---------------------------------------------------------------------------
function ColorPicker({
    value,
    onChange,
}: {
    value?: string;
    onChange: (val?: string) => void;
}) {
    const [customHex, setCustomHex] = useState(value || '');

    return (
        <Popover>
            <PopoverTrigger
                render={
                    <button
                        type="button"
                        className="flex items-center gap-1.5 h-7 px-2 border rounded-md text-xs hover:bg-muted/50 transition-colors cursor-pointer w-full"
                        aria-label="Select text color"
                    >
                        <span
                            className="size-3.5 rounded-full border shrink-0 shadow-2xs"
                            style={{
                                backgroundColor: value || 'var(--foreground)',
                            }}
                        />
                        <span className="truncate text-muted-foreground font-mono text-[11px] flex-1 text-left">
                            {value || 'Default'}
                        </span>
                    </button>
                }
            />
            <PopoverContent className="w-56 p-2.5 space-y-2 text-xs" align="start">
                <div className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
                    Palette
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {THEME_SWATCHES.map((s) => (
                        <button
                            key={s.label}
                            type="button"
                            onClick={() => {
                                onChange(s.value);
                                setCustomHex(s.value);
                            }}
                            title={s.label}
                            className={cn(
                                'size-5 rounded border transition-transform hover:scale-110 cursor-pointer shadow-2xs',
                                value === s.value && 'ring-2 ring-primary ring-offset-1'
                            )}
                            style={{ backgroundColor: s.value }}
                            aria-label={s.label}
                        />
                    ))}
                </div>
                <div className="pt-1 border-t space-y-1">
                    <div className="flex items-center gap-1.5">
                        <Input
                            value={customHex}
                            placeholder="#000000 or var(...)"
                            onChange={(e) => setCustomHex(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    onChange(customHex ? customHex.trim() : undefined);
                                }
                            }}
                            className="h-6 text-[11px] font-mono px-1.5 py-0"
                        />
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="h-6 px-2 text-[11px] cursor-pointer"
                            onClick={() => onChange(customHex ? customHex.trim() : undefined)}
                        >
                            Set
                        </Button>
                    </div>
                    {value && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-full text-[11px] text-muted-foreground cursor-pointer"
                            onClick={() => {
                                onChange(undefined);
                                setCustomHex('');
                            }}
                        >
                            Reset to default color
                        </Button>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

// ---------------------------------------------------------------------------
// Main Component: ChartTextStyleControls
// ---------------------------------------------------------------------------
export function ChartTextStyleControls({
    chartType,
    config,
    onUpdateTextStyle,
}: ChartTextStyleControlsProps) {
    const textStyle = normalizeTextStyle(config);

    const handleApplyPreset = (preset: string | null) => {
        if (!preset) return;
        if (preset === 'compact') {
            onUpdateTextStyle({
                title: { fontSize: 13, fontWeight: 'medium' },
                subtitle: { fontSize: 11 },
                axisLabels: { fontSize: 10 },
                legend: { fontSize: 10 },
                dataLabels: { fontSize: 9 },
                numberValue: { fontSize: 28, fontWeight: 'semibold' },
            });
        } else if (preset === 'default') {
            onUpdateTextStyle({
                title: { fontSize: 14, fontWeight: 'medium' },
                subtitle: { fontSize: 12 },
                axisLabels: { fontSize: 12 },
                legend: { fontSize: 12 },
                dataLabels: { fontSize: 11 },
                numberValue: { fontSize: 36, fontWeight: 'semibold' },
            });
        } else if (preset === 'presentation') {
            onUpdateTextStyle({
                title: { fontSize: 20, fontWeight: 'bold' },
                subtitle: { fontSize: 14 },
                axisLabels: { fontSize: 14 },
                legend: { fontSize: 14 },
                dataLabels: { fontSize: 13 },
                numberValue: { fontSize: 56, fontWeight: 'bold' },
            });
        }
    };

    const handleResetDefaults = () => {
        onUpdateTextStyle({
            title: {
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 'medium',
                align: 'left',
                color: undefined,
                show: true,
            },
            subtitle: {
                text: undefined,
                fontFamily: 'inherit',
                fontSize: 12,
                color: undefined,
            },
            axisLabels: {
                fontFamily: 'inherit',
                fontSize: 12,
                color: undefined,
            },
            legend: {
                fontFamily: 'inherit',
                fontSize: 12,
                color: undefined,
                show: true,
            },
            dataLabels: {
                fontFamily: 'inherit',
                fontSize: 11,
                fontWeight: 'normal',
                color: undefined,
            },
            numberValue: {
                fontSize: 36,
                fontWeight: 'semibold',
            },
        });
    };

    const hasAxes = chartType === 'bar' || chartType === 'line' || chartType === 'area' || chartType === 'row';
    const hasDataLabels = chartType === 'bar' || chartType === 'line' || chartType === 'row';
    const hasLegend = chartType !== 'number' && chartType !== 'table';
    const isNumber = chartType === 'number';

    return (
        <div className="space-y-3.5 pt-1 text-xs">
            {/* Top Toolbar: Preset select & Reset button */}
            <div className="flex items-center gap-1.5 pb-2 border-b">
                <div className="flex-1 min-w-0">
                    <Select onValueChange={handleApplyPreset} items={PRESET_OPTIONS}>
                        <SelectTrigger className="h-7 text-xs w-full">
                            <SelectValue placeholder="Preset..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                {PRESET_OPTIONS.map((p) => (
                                    <SelectItem key={p.value} value={p.value} className="text-xs">
                                        {p.label}
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px] gap-1 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={handleResetDefaults}
                    title="Reset to defaults"
                >
                    <RotateCcwIcon className="size-3" />
                    Reset
                </Button>
            </div>

            {/* Block 1: TITLE */}
            <div className="space-y-2 border-b pb-3">
                <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-foreground">Title</span>
                    <div className="flex items-center gap-1.5">
                        <label htmlFor="title-show-toggle" className="text-[11px] text-muted-foreground cursor-pointer">
                            Show
                        </label>
                        <Switch
                            id="title-show-toggle"
                            size="sm"
                            checked={textStyle.title.show}
                            onCheckedChange={(checked) =>
                                onUpdateTextStyle({
                                    title: { ...textStyle.title, show: checked },
                                })
                            }
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[11px] text-muted-foreground">Subtitle text</label>
                    <Input
                        value={textStyle.subtitle.text || ''}
                        placeholder="Optional subtitle..."
                        onChange={(e) =>
                            onUpdateTextStyle({
                                subtitle: { ...textStyle.subtitle, text: e.target.value },
                            })
                        }
                        className="h-7 text-xs"
                    />
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground">Font</label>
                        <FontPicker
                            value={textStyle.title.fontFamily}
                            onChange={(val) =>
                                onUpdateTextStyle({
                                    title: { ...textStyle.title, fontFamily: val },
                                    subtitle: { ...textStyle.subtitle, fontFamily: val },
                                })
                            }
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground">Color</label>
                        <ColorPicker
                            value={textStyle.title.color}
                            onChange={(val) =>
                                onUpdateTextStyle({
                                    title: { ...textStyle.title, color: val },
                                })
                            }
                        />
                    </div>
                </div>

                <div className="space-y-1">
                    <div className="flex justify-between items-center text-[11px] text-muted-foreground">
                        <span>Size</span>
                        <span className="font-mono">{textStyle.title.fontSize}px</span>
                    </div>
                    <FontSizeStepper
                        value={textStyle.title.fontSize}
                        min={12}
                        max={48}
                        onChange={(val) =>
                            onUpdateTextStyle({
                                title: { ...textStyle.title, fontSize: val },
                            })
                        }
                    />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-0.5">
                    <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground">Weight</label>
                        <ToggleGroup
                            value={[textStyle.title.fontWeight]}
                            onValueChange={(vals) => {
                                if (vals && vals.length > 0) {
                                    onUpdateTextStyle({
                                        title: {
                                            ...textStyle.title,
                                            fontWeight: vals[vals.length - 1] as ChartFontWeight,
                                        },
                                    });
                                }
                            }}
                            className="w-full grid grid-cols-4 gap-0.5"
                        >
                            <ToggleGroupItem value="normal" className="h-6 px-1 text-[10px]" title="Normal">
                                N
                            </ToggleGroupItem>
                            <ToggleGroupItem value="medium" className="h-6 px-1 text-[10px]" title="Medium">
                                M
                            </ToggleGroupItem>
                            <ToggleGroupItem value="semibold" className="h-6 px-1 text-[10px]" title="Semibold">
                                S
                            </ToggleGroupItem>
                            <ToggleGroupItem value="bold" className="h-6 px-1 text-[10px]" title="Bold">
                                B
                            </ToggleGroupItem>
                        </ToggleGroup>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground">Alignment</label>
                        <ToggleGroup
                            value={[textStyle.title.align]}
                            onValueChange={(vals) => {
                                if (vals && vals.length > 0) {
                                    onUpdateTextStyle({
                                        title: {
                                            ...textStyle.title,
                                            align: vals[vals.length - 1] as ChartTextAlign,
                                        },
                                    });
                                }
                            }}
                            className="w-full grid grid-cols-3 gap-0.5"
                        >
                            <ToggleGroupItem value="left" className="h-6 p-0" title="Align left">
                                <AlignLeftIcon className="size-3" />
                            </ToggleGroupItem>
                            <ToggleGroupItem value="center" className="h-6 p-0" title="Align center">
                                <AlignCenterIcon className="size-3" />
                            </ToggleGroupItem>
                            <ToggleGroupItem value="right" className="h-6 p-0" title="Align right">
                                <AlignRightIcon className="size-3" />
                            </ToggleGroupItem>
                        </ToggleGroup>
                    </div>
                </div>
            </div>

            {/* Block 2: NUMBER VALUE (Number charts only) */}
            {isNumber && (
                <div className="space-y-2 border-b pb-3">
                    <span className="font-semibold text-xs text-foreground">Value Display</span>
                    <div className="space-y-1">
                        <div className="flex justify-between items-center text-[11px] text-muted-foreground">
                            <span>Font Size</span>
                            <span className="font-mono">{textStyle.numberValue.fontSize}px</span>
                        </div>
                        <FontSizeStepper
                            value={textStyle.numberValue.fontSize}
                            min={20}
                            max={96}
                            onChange={(val) =>
                                onUpdateTextStyle({
                                    numberValue: { ...textStyle.numberValue, fontSize: val },
                                })
                            }
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground">Weight</label>
                        <ToggleGroup
                            value={[textStyle.numberValue.fontWeight]}
                            onValueChange={(vals) => {
                                if (vals && vals.length > 0) {
                                    onUpdateTextStyle({
                                        numberValue: {
                                            ...textStyle.numberValue,
                                            fontWeight: vals[vals.length - 1] as ChartFontWeight,
                                        },
                                    });
                                }
                            }}
                            className="w-full grid grid-cols-4 gap-0.5"
                        >
                            <ToggleGroupItem value="normal" className="h-6 px-1 text-[10px]">
                                Normal
                            </ToggleGroupItem>
                            <ToggleGroupItem value="medium" className="h-6 px-1 text-[10px]">
                                Medium
                            </ToggleGroupItem>
                            <ToggleGroupItem value="semibold" className="h-6 px-1 text-[10px]">
                                Semi
                            </ToggleGroupItem>
                            <ToggleGroupItem value="bold" className="h-6 px-1 text-[10px]">
                                Bold
                            </ToggleGroupItem>
                        </ToggleGroup>
                    </div>
                </div>
            )}

            {/* Block 3: AXIS LABELS */}
            {hasAxes && (
                <div className="space-y-2 border-b pb-3">
                    <span className="font-semibold text-xs text-foreground">Axis Labels</span>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground">Font</label>
                            <FontPicker
                                value={textStyle.axisLabels.fontFamily}
                                onChange={(val) =>
                                    onUpdateTextStyle({
                                        axisLabels: { ...textStyle.axisLabels, fontFamily: val },
                                    })
                                }
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground">Color</label>
                            <ColorPicker
                                value={textStyle.axisLabels.color}
                                onChange={(val) =>
                                    onUpdateTextStyle({
                                        axisLabels: { ...textStyle.axisLabels, color: val },
                                    })
                                }
                            />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between items-center text-[11px] text-muted-foreground">
                            <span>Size</span>
                            <span className="font-mono">{textStyle.axisLabels.fontSize}px</span>
                        </div>
                        <FontSizeStepper
                            value={textStyle.axisLabels.fontSize}
                            min={8}
                            max={24}
                            onChange={(val) =>
                                onUpdateTextStyle({
                                    axisLabels: { ...textStyle.axisLabels, fontSize: val },
                                })
                            }
                        />
                    </div>
                </div>
            )}

            {/* Block 4: LEGEND */}
            {hasLegend && (
                <div className="space-y-2 border-b pb-3">
                    <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-foreground">Legend</span>
                        <div className="flex items-center gap-1.5">
                            <label htmlFor="legend-show-toggle" className="text-[11px] text-muted-foreground cursor-pointer">
                                Show
                            </label>
                            <Switch
                                id="legend-show-toggle"
                                size="sm"
                                checked={textStyle.legend.show}
                                onCheckedChange={(checked) =>
                                    onUpdateTextStyle({
                                        legend: { ...textStyle.legend, show: checked },
                                    })
                                }
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground">Font</label>
                            <FontPicker
                                value={textStyle.legend.fontFamily}
                                onChange={(val) =>
                                    onUpdateTextStyle({
                                        legend: { ...textStyle.legend, fontFamily: val },
                                    })
                                }
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground">Color</label>
                            <ColorPicker
                                value={textStyle.legend.color}
                                onChange={(val) =>
                                    onUpdateTextStyle({
                                        legend: { ...textStyle.legend, color: val },
                                    })
                                }
                            />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between items-center text-[11px] text-muted-foreground">
                            <span>Size</span>
                            <span className="font-mono">{textStyle.legend.fontSize}px</span>
                        </div>
                        <FontSizeStepper
                            value={textStyle.legend.fontSize}
                            min={8}
                            max={24}
                            onChange={(val) =>
                                onUpdateTextStyle({
                                    legend: { ...textStyle.legend, fontSize: val },
                                })
                            }
                        />
                    </div>
                </div>
            )}

            {/* Block 5: DATA LABELS */}
            {hasDataLabels && (
                <div className="space-y-2 pb-1">
                    <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-foreground">Data Labels</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground">Font</label>
                            <FontPicker
                                value={textStyle.dataLabels.fontFamily}
                                onChange={(val) =>
                                    onUpdateTextStyle({
                                        dataLabels: { ...textStyle.dataLabels, fontFamily: val },
                                    })
                                }
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground">Color</label>
                            <ColorPicker
                                value={textStyle.dataLabels.color}
                                onChange={(val) =>
                                    onUpdateTextStyle({
                                        dataLabels: { ...textStyle.dataLabels, color: val },
                                    })
                                }
                            />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between items-center text-[11px] text-muted-foreground">
                            <span>Size</span>
                            <span className="font-mono">{textStyle.dataLabels.fontSize}px</span>
                        </div>
                        <FontSizeStepper
                            value={textStyle.dataLabels.fontSize}
                            min={8}
                            max={24}
                            onChange={(val) =>
                                onUpdateTextStyle({
                                    dataLabels: { ...textStyle.dataLabels, fontSize: val },
                                })
                            }
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground">Weight</label>
                        <ToggleGroup
                            value={[textStyle.dataLabels.fontWeight]}
                            onValueChange={(vals) => {
                                if (vals && vals.length > 0) {
                                    onUpdateTextStyle({
                                        dataLabels: {
                                            ...textStyle.dataLabels,
                                            fontWeight: vals[vals.length - 1] as ChartFontWeight,
                                        },
                                    });
                                }
                            }}
                            className="w-full grid grid-cols-4 gap-0.5"
                        >
                            <ToggleGroupItem value="normal" className="h-6 px-1 text-[10px]">
                                Normal
                            </ToggleGroupItem>
                            <ToggleGroupItem value="medium" className="h-6 px-1 text-[10px]">
                                Medium
                            </ToggleGroupItem>
                            <ToggleGroupItem value="semibold" className="h-6 px-1 text-[10px]">
                                Semi
                            </ToggleGroupItem>
                            <ToggleGroupItem value="bold" className="h-6 px-1 text-[10px]">
                                Bold
                            </ToggleGroupItem>
                        </ToggleGroup>
                    </div>
                </div>
            )}
        </div>
    );
}
