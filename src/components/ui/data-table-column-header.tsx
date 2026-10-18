'use client';

import * as React from 'react';
import type { RowData } from '@tanstack/react-table';
import type { LegacyColumn } from '@tanstack/react-table/legacy';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, EyeOffIcon } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DataTableColumnHeaderProps<TData extends RowData, TValue> extends React.HTMLAttributes<HTMLDivElement> {
    column: LegacyColumn<TData, TValue>;
    title: string;
}

export function DataTableColumnHeader<TData extends RowData, TValue = unknown>({
    column,
    title,
    className,
}: DataTableColumnHeaderProps<TData, TValue>) {
    if (!column.getCanSort()) {
        return <div className={cn('text-xs font-medium', className)}>{title}</div>;
    }

    const isSorted = column.getIsSorted();

    return (
        <div className={cn('flex items-center space-x-1', className)}>
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={
                        <Button
                            variant="ghost"
                            size="sm"
                            className="-ml-2 h-8 text-xs font-medium"
                        />
                    }
                >
                    <span>{title}</span>
                    {isSorted === 'desc' ? (
                        <ArrowDownIcon className="ml-1.5 size-3.5" />
                    ) : isSorted === 'asc' ? (
                        <ArrowUpIcon className="ml-1.5 size-3.5" />
                    ) : (
                        <ChevronsUpDownIcon className="ml-1.5 size-3.5 text-muted-foreground/70" />
                    )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-36">
                    <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
                        <ArrowUpIcon className="mr-2 size-3.5 text-muted-foreground/70" />
                        Asc
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
                        <ArrowDownIcon className="mr-2 size-3.5 text-muted-foreground/70" />
                        Desc
                    </DropdownMenuItem>
                    {column.getCanHide() && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                                <EyeOffIcon className="mr-2 size-3.5 text-muted-foreground/70" />
                                Hide
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}

