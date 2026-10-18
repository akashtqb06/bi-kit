'use client';

import React, { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { CheckIcon, LaptopIcon, MoonIcon, SunIcon, Rows3Icon, Rows4Icon, PaletteIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from 'cn';

type Density = 'comfortable' | 'compact';

export function AppearanceForm() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [density, setDensity] = useState<Density>('comfortable');

    useEffect(() => {
        const stored = (localStorage.getItem('density') as Density) || 'comfortable';
        document.documentElement.setAttribute('data-density', stored);
        requestAnimationFrame(() => {
            setMounted(true);
            setDensity(stored);
        });
    }, []);

    const handleDensityChange = (newDensity: Density) => {
        setDensity(newDensity);
        localStorage.setItem('density', newDensity);
        document.documentElement.setAttribute('data-density', newDensity);
    };

    if (!mounted) {
        return (
            <div className="space-y-6">
                <Card className="h-64 animate-pulse bg-muted/40" />
                <Card className="h-64 animate-pulse bg-muted/40" />
            </div>
        );
    }

    const currentTheme = theme || 'system';

    return (
        <div className="space-y-6">
            {/* Theme Selector */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <PaletteIcon className="size-5 text-muted-foreground" />
                        <CardTitle>Theme</CardTitle>
                    </div>
                    <CardDescription>
                        Select your preferred color theme or synchronize with your operating system.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {/* Light theme */}
                        <button
                            type="button"
                            onClick={() => setTheme('light')}
                            className={cn(
                                'flex flex-col text-left rounded-xl border-2 p-3 transition-all hover:bg-muted/40 focus:outline-hidden',
                                currentTheme === 'light'
                                    ? 'border-primary ring-2 ring-primary/20 shadow-xs'
                                    : 'border-border hover:border-muted-foreground/30'
                            )}
                        >
                            {/* Preview box */}
                            <div className="w-full h-24 rounded-lg bg-zinc-100 border border-zinc-200 p-2 flex gap-1.5 shadow-2xs overflow-hidden">
                                <div className="w-1/4 h-full bg-white rounded-xs border border-zinc-200 flex flex-col gap-1 p-1">
                                    <div className="w-full h-1.5 bg-zinc-300 rounded-full" />
                                    <div className="w-3/4 h-1 bg-zinc-200 rounded-full" />
                                    <div className="w-1/2 h-1 bg-zinc-200 rounded-full" />
                                </div>
                                <div className="flex-1 flex flex-col gap-1.5">
                                    <div className="w-full h-3 bg-white rounded-xs border border-zinc-200 flex items-center px-1">
                                        <div className="w-1/3 h-1 bg-zinc-300 rounded-full" />
                                    </div>
                                    <div className="flex-1 grid grid-cols-2 gap-1">
                                        <div className="bg-white rounded-xs border border-zinc-200 p-1 flex flex-col justify-end">
                                            <div className="w-full h-2 bg-blue-500 rounded-xs" />
                                        </div>
                                        <div className="bg-white rounded-xs border border-zinc-200 p-1 flex flex-col justify-end">
                                            <div className="w-full h-4 bg-emerald-500 rounded-xs" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-3 flex items-center justify-between">
                                <div className="flex items-center gap-1.5 font-medium text-sm">
                                    <SunIcon className="size-4 text-amber-500" />
                                    <span>Light</span>
                                </div>
                                {currentTheme === 'light' && (
                                    <CheckIcon className="size-4 text-primary" />
                                )}
                            </div>
                            <span className="text-xs text-muted-foreground mt-0.5">
                                Clean, crisp light interface
                            </span>
                        </button>

                        {/* Dark theme */}
                        <button
                            type="button"
                            onClick={() => setTheme('dark')}
                            className={cn(
                                'flex flex-col text-left rounded-xl border-2 p-3 transition-all hover:bg-muted/40 focus:outline-hidden',
                                currentTheme === 'dark'
                                    ? 'border-primary ring-2 ring-primary/20 shadow-xs'
                                    : 'border-border hover:border-muted-foreground/30'
                            )}
                        >
                            {/* Preview box */}
                            <div className="w-full h-24 rounded-lg bg-zinc-950 border border-zinc-800 p-2 flex gap-1.5 shadow-2xs overflow-hidden">
                                <div className="w-1/4 h-full bg-zinc-900 rounded-xs border border-zinc-800 flex flex-col gap-1 p-1">
                                    <div className="w-full h-1.5 bg-zinc-700 rounded-full" />
                                    <div className="w-3/4 h-1 bg-zinc-800 rounded-full" />
                                    <div className="w-1/2 h-1 bg-zinc-800 rounded-full" />
                                </div>
                                <div className="flex-1 flex flex-col gap-1.5">
                                    <div className="w-full h-3 bg-zinc-900 rounded-xs border border-zinc-800 flex items-center px-1">
                                        <div className="w-1/3 h-1 bg-zinc-700 rounded-full" />
                                    </div>
                                    <div className="flex-1 grid grid-cols-2 gap-1">
                                        <div className="bg-zinc-900 rounded-xs border border-zinc-800 p-1 flex flex-col justify-end">
                                            <div className="w-full h-2 bg-blue-500 rounded-xs" />
                                        </div>
                                        <div className="bg-zinc-900 rounded-xs border border-zinc-800 p-1 flex flex-col justify-end">
                                            <div className="w-full h-4 bg-emerald-500 rounded-xs" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-3 flex items-center justify-between">
                                <div className="flex items-center gap-1.5 font-medium text-sm">
                                    <MoonIcon className="size-4 text-blue-400" />
                                    <span>Dark</span>
                                </div>
                                {currentTheme === 'dark' && (
                                    <CheckIcon className="size-4 text-primary" />
                                )}
                            </div>
                            <span className="text-xs text-muted-foreground mt-0.5">
                                Elegant and easy on the eyes
                            </span>
                        </button>

                        {/* System theme */}
                        <button
                            type="button"
                            onClick={() => setTheme('system')}
                            className={cn(
                                'flex flex-col text-left rounded-xl border-2 p-3 transition-all hover:bg-muted/40 focus:outline-hidden',
                                currentTheme === 'system'
                                    ? 'border-primary ring-2 ring-primary/20 shadow-xs'
                                    : 'border-border hover:border-muted-foreground/30'
                            )}
                        >
                            {/* Preview box with split */}
                            <div className="w-full h-24 rounded-lg border border-border p-0 flex shadow-2xs overflow-hidden">
                                <div className="w-1/2 h-full bg-zinc-100 p-2 flex flex-col gap-1.5 border-r border-zinc-200">
                                    <div className="w-full h-3 bg-white rounded-xs border border-zinc-200" />
                                    <div className="flex-1 bg-white rounded-xs border border-zinc-200 p-1 flex items-end">
                                        <div className="w-full h-3 bg-blue-500 rounded-xs" />
                                    </div>
                                </div>
                                <div className="w-1/2 h-full bg-zinc-950 p-2 flex flex-col gap-1.5">
                                    <div className="w-full h-3 bg-zinc-900 rounded-xs border border-zinc-800" />
                                    <div className="flex-1 bg-zinc-900 rounded-xs border border-zinc-800 p-1 flex items-end">
                                        <div className="w-full h-3 bg-blue-500 rounded-xs" />
                                    </div>
                                </div>
                            </div>
                            <div className="mt-3 flex items-center justify-between">
                                <div className="flex items-center gap-1.5 font-medium text-sm">
                                    <LaptopIcon className="size-4 text-muted-foreground" />
                                    <span>System</span>
                                </div>
                                {currentTheme === 'system' && (
                                    <CheckIcon className="size-4 text-primary" />
                                )}
                            </div>
                            <span className="text-xs text-muted-foreground mt-0.5">
                                Match OS color preference
                            </span>
                        </button>
                    </div>
                </CardContent>
            </Card>

            {/* Density Selector */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Rows3Icon className="size-5 text-muted-foreground" />
                        <CardTitle>Interface Density</CardTitle>
                    </div>
                    <CardDescription>
                        Adjust the vertical row height and spacing across data tables and lists.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Comfortable */}
                        <button
                            type="button"
                            onClick={() => handleDensityChange('comfortable')}
                            className={cn(
                                'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all hover:bg-muted/40 focus:outline-hidden',
                                density === 'comfortable'
                                    ? 'border-primary ring-2 ring-primary/20 shadow-xs'
                                    : 'border-border hover:border-muted-foreground/30'
                            )}
                        >
                            <div className="p-2 rounded-lg bg-muted text-muted-foreground shrink-0">
                                <Rows3Icon className="size-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-sm">Comfortable</span>
                                    {density === 'comfortable' && (
                                        <Badge variant="default" className="text-xs">
                                            Active
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Spacious 48px row heights with relaxed padding. Recommended for general browsing.
                                </p>
                            </div>
                        </button>

                        {/* Compact */}
                        <button
                            type="button"
                            onClick={() => handleDensityChange('compact')}
                            className={cn(
                                'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all hover:bg-muted/40 focus:outline-hidden',
                                density === 'compact'
                                    ? 'border-primary ring-2 ring-primary/20 shadow-xs'
                                    : 'border-border hover:border-muted-foreground/30'
                            )}
                        >
                            <div className="p-2 rounded-lg bg-muted text-muted-foreground shrink-0">
                                <Rows4Icon className="size-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-sm">Compact</span>
                                    {density === 'compact' && (
                                        <Badge variant="default" className="text-xs">
                                            Active
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Dense 36px row heights to maximize information density for data-heavy views.
                                </p>
                            </div>
                        </button>
                    </div>

                    {/* Live Preview of table row density */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Live Data Table Preview
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                                current: {density}
                            </span>
                        </div>
                        <div className="rounded-lg border overflow-hidden bg-card">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="h-10 [[data-density=compact]_&]:h-8">Workbook</TableHead>
                                        <TableHead className="h-10 [[data-density=compact]_&]:h-8">Source</TableHead>
                                        <TableHead className="h-10 [[data-density=compact]_&]:h-8">Queries</TableHead>
                                        <TableHead className="h-10 [[data-density=compact]_&]:h-8">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow className="h-12 [[data-density=compact]_&]:h-9 transition-all">
                                        <TableCell className="h-12 [[data-density=compact]_&]:h-9 py-0 font-medium">Sales Executive Summary</TableCell>
                                        <TableCell className="h-12 [[data-density=compact]_&]:h-9 py-0 text-muted-foreground">PostgreSQL Production</TableCell>
                                        <TableCell className="h-12 [[data-density=compact]_&]:h-9 py-0">12</TableCell>
                                        <TableCell className="h-12 [[data-density=compact]_&]:h-9 py-0">
                                            <Badge variant="secondary" className="text-xs font-normal">Active</Badge>
                                        </TableCell>
                                    </TableRow>
                                    <TableRow className="h-12 [[data-density=compact]_&]:h-9 transition-all">
                                        <TableCell className="h-12 [[data-density=compact]_&]:h-9 py-0 font-medium">Quarterly Cohort Retention</TableCell>
                                        <TableCell className="h-12 [[data-density=compact]_&]:h-9 py-0 text-muted-foreground">users_export.csv</TableCell>
                                        <TableCell className="h-12 [[data-density=compact]_&]:h-9 py-0">6</TableCell>
                                        <TableCell className="h-12 [[data-density=compact]_&]:h-9 py-0">
                                            <Badge variant="secondary" className="text-xs font-normal">Active</Badge>
                                        </TableCell>
                                    </TableRow>
                                    <TableRow className="h-12 [[data-density=compact]_&]:h-9 transition-all">
                                        <TableCell className="h-12 [[data-density=compact]_&]:h-9 py-0 font-medium">API Latency Monitoring</TableCell>
                                        <TableCell className="h-12 [[data-density=compact]_&]:h-9 py-0 text-muted-foreground">Metrics SQLite</TableCell>
                                        <TableCell className="h-12 [[data-density=compact]_&]:h-9 py-0">18</TableCell>
                                        <TableCell className="h-12 [[data-density=compact]_&]:h-9 py-0">
                                            <Badge variant="secondary" className="text-xs font-normal">Active</Badge>
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
