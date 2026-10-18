'use client';

import * as React from 'react';
import type { RowData } from '@tanstack/react-table';
import type { LegacyReactTable } from '@tanstack/react-table/legacy';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface DataTablePaginationProps<TData extends RowData> {
    table: LegacyReactTable<TData>;
    pageSizeOptions?: number[];
}

export function DataTablePagination<TData extends RowData>({
    table,
    pageSizeOptions = [10, 20, 50],
}: DataTablePaginationProps<TData>) {
    const totalRows = table.getFilteredRowModel().rows.length;
    const pageIndex = table.getState().pagination.pageIndex;
    const pageSize = table.getState().pagination.pageSize;
    const start = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
    const end = Math.min((pageIndex + 1) * pageSize, totalRows);

    return (
        <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-t bg-card">
            <div className="text-xs text-muted-foreground">
                Showing {start}-{end} of {totalRows}
            </div>
            <div className="flex items-center space-x-4 sm:space-x-6">
                <div className="flex items-center space-x-2">
                    <p className="text-xs text-muted-foreground whitespace-nowrap">Rows per page</p>
                    <Select
                        value={String(pageSize)}
                        items={pageSizeOptions.map((size) => ({ value: String(size), label: String(size) }))}
                        onValueChange={(val) => {
                            if (val) table.setPageSize(Number(val));
                        }}
                    >
                        <SelectTrigger className="h-8 w-18 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent side="top">
                            {pageSizeOptions.map((size) => (
                                <SelectItem key={size} value={String(size)} className="text-xs">
                                    {size}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-center space-x-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 text-xs"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                    >
                        Previous
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 text-xs"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                    >
                        Next
                    </Button>
                </div>
            </div>
        </div>
    );
}

