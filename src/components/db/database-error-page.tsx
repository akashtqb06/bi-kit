'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Database, AlertTriangle, Terminal, RefreshCw, Check, Copy, ServerOff } from 'lucide-react';
import type { DatabaseHealthStatus } from '@src/lib/db/health';

export interface DatabaseErrorPageProps {
    health?: DatabaseHealthStatus;
    error?: unknown;
    onRetry?: () => void;
}

export function DatabaseErrorPage({ health, error, onRetry }: DatabaseErrorPageProps) {
    const [copied, setCopied] = useState(false);
    const isDev = process.env.NODE_ENV !== 'production';

    // Derive failure details from health status or raw error
    let reason: 'unreachable' | 'not_migrated' | 'error' = 'error';
    let title = 'Service Temporarily Unavailable';
    let message = 'Our database service is temporarily unavailable. Please try again shortly.';
    let exactFix = '';
    let fixCommand = '';
    let detailMessage = '';
    let errorCode = '';

    if (health && !health.ok) {
        reason = health.reason;
        title = health.title;
        message = health.message;
        exactFix = health.exactFix;
        fixCommand = health.fix;
        detailMessage = health.detail || health.error || '';
    } else if (error) {
        const rawMsg = error instanceof Error ? error.message : String(error);
        const errObj = error as { code?: string; cause?: { code?: string; message?: string } };
        errorCode = errObj.code || errObj.cause?.code || '';
        const combined = `${errorCode} ${rawMsg}`.toLowerCase();

        if (
            errorCode === 'ECONNREFUSED' ||
            errorCode === 'ETIMEDOUT' ||
            errorCode === 'ENOTFOUND' ||
            errorCode === 'EPERM' ||
            errorCode === '28P01' ||
            combined.includes('econnrefused') ||
            combined.includes('connection refused') ||
            combined.includes('connect eperm') ||
            combined.includes('is not reachable')
        ) {
            reason = 'unreachable';
            title = 'Database Unavailable';
            message = 'Postgres is not reachable at localhost:5432.';
            fixCommand = 'docker compose -f docker-compose.dev.yml up -d';
            exactFix = 'Postgres is not reachable at localhost:5432. Start it with docker compose -f docker-compose.dev.yml up -d';
        } else if (
            errorCode === '42P01' ||
            combined.includes('does not exist') ||
            combined.includes('not migrated')
        ) {
            reason = 'not_migrated';
            title = 'Database Not Migrated';
            message = 'Database is not migrated.';
            fixCommand = 'pnpm db:migrate';
            exactFix = 'Database is not migrated. Run pnpm db:migrate';
        }
        detailMessage = rawMsg;
    }

    const handleCopy = () => {
        if (!fixCommand) return;
        navigator.clipboard.writeText(fixCommand);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleRetry = () => {
        if (onRetry) {
            onRetry();
        } else if (typeof window !== 'undefined') {
            window.location.reload();
        }
    };

    // In production, render a clean, generic 503-style message with no internal details
    if (!isDev) {
        return (
            <div className="flex min-h-dvh w-full items-center justify-center bg-muted/30 p-4">
                <Card className="w-full max-w-md shadow-lg border-muted">
                    <CardHeader className="text-center pb-3">
                        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                            <ServerOff className="size-7" />
                        </div>
                        <Badge variant="outline" className="mx-auto mb-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                            503 Service Unavailable
                        </Badge>
                        <CardTitle className="text-xl">Database Temporarily Unavailable</CardTitle>
                        <CardDescription className="text-sm">
                            We are currently experiencing technical difficulties connecting to our database.
                            Please try again in a few moments.
                        </CardDescription>
                    </CardHeader>
                    <CardFooter className="flex justify-center pt-2">
                        <Button onClick={handleRetry} className="gap-2">
                            <RefreshCw className="size-4" />
                            Retry Connection
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    // In development: Render full-page diagnostics with exact instructions and fix command
    return (
        <div className="flex min-h-dvh w-full items-center justify-center bg-muted/40 p-4 font-sans">
            <Card className="w-full max-w-xl shadow-xl border-destructive/20 bg-background">
                <CardHeader className="space-y-3 pb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex size-11 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
                                {reason === 'unreachable' ? (
                                    <ServerOff className="size-6" />
                                ) : (
                                    <AlertTriangle className="size-6" />
                                )}
                            </div>
                            <div>
                                <CardTitle className="text-xl font-bold tracking-tight text-foreground">
                                    {title}
                                </CardTitle>
                                <CardDescription className="text-sm text-muted-foreground mt-0.5">
                                    {message}
                                </CardDescription>
                            </div>
                        </div>
                        <Badge
                            variant="destructive"
                            className="text-xs uppercase font-mono tracking-wider font-semibold"
                        >
                            {reason === 'unreachable' ? 'Connection Error' : reason === 'not_migrated' ? 'Migration Required' : '503 Outage'}
                        </Badge>
                    </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-1">
                    {/* Exact Fix Banner */}
                    {exactFix && (
                        <div className="rounded-lg border border-primary/25 bg-primary/5 p-3.5 text-sm">
                            <div className="font-semibold text-foreground flex items-center gap-2 mb-1">
                                <Database className="size-4 text-primary shrink-0" />
                                <span>Required Resolution</span>
                            </div>
                            <p className="text-muted-foreground text-xs leading-relaxed">
                                {exactFix}
                            </p>
                        </div>
                    )}

                    {/* Copyable Fix Command Box */}
                    {fixCommand && (
                        <div className="space-y-1.5">
                            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                <Terminal className="size-3.5" />
                                Run this command in your terminal:
                            </span>
                            <div className="flex items-center justify-between rounded-lg bg-zinc-950 px-3.5 py-2.5 font-mono text-xs text-zinc-100 shadow-inner">
                                <code className="break-all">{fixCommand}</code>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleCopy}
                                    className="ml-3 h-7 px-2 text-zinc-300 hover:text-white hover:bg-zinc-800 shrink-0"
                                >
                                    {copied ? (
                                        <>
                                            <Check className="size-3.5 text-emerald-400 mr-1" />
                                            <span className="text-xs text-emerald-400">Copied</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="size-3.5 mr-1" />
                                            <span className="text-xs">Copy</span>
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Technical Diagnostic Details */}
                    {detailMessage && (
                        <div className="rounded-lg border bg-muted/40 p-3 text-xs font-mono space-y-1">
                            <div className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                                Diagnostics:
                            </div>
                            <div className="text-foreground/90 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                                {detailMessage}
                            </div>
                        </div>
                    )}
                </CardContent>

                <CardFooter className="flex items-center justify-between border-t bg-muted/10 px-6 py-3.5">
                    <span className="text-xs text-muted-foreground">
                        Development Diagnostics &bull; 503 Guard
                    </span>
                    <Button onClick={handleRetry} size="sm" className="gap-2">
                        <RefreshCw className="size-3.5" />
                        Retry Connection
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}

