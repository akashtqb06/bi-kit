'use client';

import React, { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowUpDownIcon, ArrowUpIcon, ArrowDownIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { parseDateSafe } from '@src/lib/charts/aggregate';

export interface UnderlyingDataTableProps {
    columnNames: string[];
    rows: Record<string, unknown>[];
    className?: string;
    maxHeight?: string;
}

export function UnderlyingDataTable({
    columnNames,
    rows,
    className,
    maxHeight = 'max-h-[300px]',
}: UnderlyingDataTableProps) {
    const [sortCol, setSortCol] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null);

    // Analyze column types (numeric vs date vs text)
    const columnTypes = useMemo(() => {
        const types: Record<string, 'number' | 'date' | 'text'> = {};
        for (const col of columnNames) {
            let hasNumber = false;
            let hasDate = false;
            let nonNullCount = 0;

            for (const r of rows) {
                const val = r[col];
                if (val === null || val === undefined || val === '') continue;
                nonNullCount++;

                if (typeof val === 'number') {
                    hasNumber = true;
                } else if (typeof val === 'string') {
                    // Check if it's already "Month, Year" like "September, 2016"
                    if (/^[A-Za-z]+,\s*\d{4}$/.test(val.trim())) {
                        hasDate = true;
                    } else if (parseDateSafe(val)) {
                        hasDate = true;
                    } else if (!isNaN(Number(val)) && val.trim() !== '') {
                        hasNumber = true;
                    }
                }
            }

            if (nonNullCount === 0) {
                types[col] = 'text';
            } else if (hasDate && !hasNumber) {
                types[col] = 'date';
            } else if (hasNumber && !hasDate) {
                types[col] = 'number';
            } else {
                types[col] = 'text';
            }
        }
        return types;
    }, [columnNames, rows]);

    // Handle column header sort click
    const handleSort = (col: string) => {
        if (sortCol !== col) {
            setSortCol(col);
            setSortDir('asc');
        } else if (sortDir === 'asc') {
            setSortDir('desc');
        } else {
            setSortCol(null);
            setSortDir(null);
        }
    };

    // Sort rows
    const sortedRows = useMemo(() => {
        if (!sortCol || !sortDir) return rows;

        const isNum = columnTypes[sortCol] === 'number';
        const isDt = columnTypes[sortCol] === 'date';

        return [...rows].sort((a, b) => {
            const va = a[sortCol];
            const vb = b[sortCol];

            if (va === null || va === undefined) return 1;
            if (vb === null || vb === undefined) return -1;

            if (isNum) {
                const na = Number(va) || 0;
                const nb = Number(vb) || 0;
                return sortDir === 'asc' ? na - nb : nb - na;
            }

            if (isDt) {
                const da = parseDateSafe(va);
                const db = parseDateSafe(vb);
                if (da && db) {
                    return sortDir === 'asc' ? da.getTime() - db.getTime() : db.getTime() - da.getTime();
                }
            }

            const sa = String(va);
            const sb = String(vb);
            return sortDir === 'asc'
                ? sa.localeCompare(sb, undefined, { numeric: true })
                : sb.localeCompare(sa, undefined, { numeric: true });
        });
    }, [rows, sortCol, sortDir, columnTypes]);

    if (rows.length === 0 || columnNames.length === 0) {
        return (
            <div className="flex h-32 items-center justify-center text-xs text-muted-foreground border rounded-md border-dashed">
                No underlying data available
            </div>
        );
    }

    return (
        <div className={cn('relative flex flex-col w-full border rounded-md overflow-hidden bg-card', className)}>
            <div className={cn('overflow-auto w-full', maxHeight)}>
                <Table className="w-full text-xs">
                    <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-xs border-b">
                        <TableRow className="hover:bg-transparent">
                            {columnNames.map((col) => {
                                const isNum = columnTypes[col] === 'number';
                                const isSorted = sortCol === col;

                                return (
                                    <TableHead
                                        key={col}
                                        onClick={() => handleSort(col)}
                                        className={cn(
                                            'h-8 px-3 py-1.5 font-semibold text-xs select-none cursor-pointer hover:text-foreground transition-colors',
                                            isNum ? 'text-right' : 'text-left'
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                'inline-flex items-center gap-1.5',
                                                isNum && 'justify-end w-full'
                                            )}
                                        >
                                            <span className="truncate">{col}</span>
                                            {isSorted ? (
                                                sortDir === 'asc' ? (
                                                    <ArrowUpIcon className="size-3 text-primary shrink-0" />
                                                ) : (
                                                    <ArrowDownIcon className="size-3 text-primary shrink-0" />
                                                )
                                            ) : (
                                                <ArrowUpDownIcon className="size-3 text-muted-foreground/30 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            )}
                                        </div>
                                    </TableHead>
                                );
                            })}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedRows.map((row, rowIdx) => (
                            <TableRow key={rowIdx} className="hover:bg-muted/30 transition-colors">
                                {columnNames.map((col) => {
                                    const val = row[col];
                                    const isNum = columnTypes[col] === 'number';
                                    const isDt = columnTypes[col] === 'date';

                                    let formattedVal: React.ReactNode = '—';

                                    if (val !== null && val !== undefined) {
                                        if (isNum) {
                                            const num = Number(val);
                                            formattedVal = isNaN(num) ? String(val) : num.toLocaleString();
                                        } else if (isDt) {
                                            // Format like "September, 2016"
                                            if (typeof val === 'string' && /^[A-Za-z]+,\s*\d{4}$/.test(val.trim())) {
                                                formattedVal = val;
                                            } else {
                                                const d = parseDateSafe(val);
                                                formattedVal = d ? format(d, 'MMMM, yyyy') : String(val);
                                            }
                                        } else {
                                            formattedVal = String(val);
                                        }
                                    }

                                    return (
                                        <TableCell
                                            key={col}
                                            className={cn(
                                                'px-3 py-1.5 truncate max-w-xs',
                                                isNum ? 'text-right font-mono tabular-nums text-foreground' : 'text-left text-muted-foreground'
                                            )}
                                        >
                                            {formattedVal}
                                        </TableCell>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

