'use client';

import * as React from 'react';
import {
    flexRender,
    type RowData,
    type SortingState,
    type RowSelectionState,
    type ColumnFiltersState,
    type PaginationState,
    type OnChangeFn,
} from '@tanstack/react-table';

export type VisibilityState = Record<string, boolean>;
import {
    useLegacyTable,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    type LegacyColumnDef,
} from '@tanstack/react-table/legacy';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTableToolbar } from './data-table-toolbar';
import { DataTablePagination } from './data-table-pagination';
import { cn } from 'cn';

export interface DataTableProps<TData extends RowData> {
    columns: LegacyColumnDef<TData, unknown>[];
    data: TData[];
    loading?: boolean;
    loadingRowsCount?: number;
    searchKey?: string;
    searchPlaceholder?: string;
    searchValue?: string;
    onSearchChange?: (val: string) => void;
    filters?: React.ReactNode;
    sorting?: SortingState;
    onSortingChange?: OnChangeFn<SortingState>;
    defaultSorting?: SortingState;
    columnFilters?: ColumnFiltersState;
    onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>;
    pagination?: PaginationState;
    onPaginationChange?: OnChangeFn<PaginationState>;
    columnVisibility?: VisibilityState;
    onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
    rowSelection?: RowSelectionState;
    onRowSelectionChange?: OnChangeFn<RowSelectionState>;
    onRowClick?: (row: TData, e: React.MouseEvent) => void;
    emptyState?: React.ReactNode;
    emptySearchState?: React.ReactNode;
    onDeleteSelected?: (selectedRows: TData[]) => Promise<void> | void;
    deleteConfirmTitle?: string;
    deleteConfirmDescription?: string;
    toolbarActions?: React.ReactNode;
    getRowId?: (row: TData, index: number) => string;
    pageSizeOptions?: number[];
    className?: string;
    hideToolbar?: boolean;
    hidePagination?: boolean;
}

export function DataTable<TData extends RowData>({
    columns,
    data,
    loading = false,
    loadingRowsCount = 5,
    searchKey = 'name',
    searchPlaceholder = 'Filter...',
    searchValue,
    onSearchChange,
    filters,
    sorting: controlledSorting,
    onSortingChange: setControlledSorting,
    defaultSorting = [],
    columnFilters: controlledColumnFilters,
    onColumnFiltersChange: setControlledColumnFilters,
    pagination: controlledPagination,
    onPaginationChange: setControlledPagination,
    columnVisibility: controlledVisibility,
    onColumnVisibilityChange: setControlledVisibility,
    rowSelection: controlledRowSelection,
    onRowSelectionChange: setControlledRowSelection,
    onRowClick,
    emptyState,
    emptySearchState,
    onDeleteSelected,
    deleteConfirmTitle,
    deleteConfirmDescription,
    toolbarActions,
    getRowId,
    pageSizeOptions = [10, 20, 50],
    className,
    hideToolbar = false,
    hidePagination = false,
}: DataTableProps<TData>) {
    // Uncontrolled fallback state
    const [uncontrolledSorting, setUncontrolledSorting] = React.useState<SortingState>(defaultSorting);
    const [uncontrolledVisibility, setUncontrolledVisibility] = React.useState<VisibilityState>({});
    const [uncontrolledRowSelection, setUncontrolledRowSelection] = React.useState<RowSelectionState>({});
    const [internalColumnFilters, setInternalColumnFilters] = React.useState<ColumnFiltersState>([]);
    const [uncontrolledPagination, setUncontrolledPagination] = React.useState<PaginationState>({
        pageIndex: 0,
        pageSize: 10,
    });
    const [isDeleting, setIsDeleting] = React.useState(false);

    const sorting = controlledSorting !== undefined ? controlledSorting : uncontrolledSorting;
    const onSortingChange = setControlledSorting ?? setUncontrolledSorting;

    const columnVisibility = controlledVisibility !== undefined ? controlledVisibility : uncontrolledVisibility;
    const onColumnVisibilityChange = setControlledVisibility ?? setUncontrolledVisibility;

    const rowSelection = controlledRowSelection !== undefined ? controlledRowSelection : uncontrolledRowSelection;
    const onRowSelectionChange = setControlledRowSelection ?? setUncontrolledRowSelection;

    const pagination = controlledPagination !== undefined ? controlledPagination : uncontrolledPagination;
    const onPaginationChange = setControlledPagination ?? setUncontrolledPagination;

    const activeColumnFilters = controlledColumnFilters !== undefined ? controlledColumnFilters : internalColumnFilters;
    const onColumnFiltersChange = setControlledColumnFilters ?? setInternalColumnFilters;

    // Derived columnFilters based on searchValue and searchKey
    const columnFilters = React.useMemo<ColumnFiltersState>(() => {
        if (searchValue !== undefined && searchKey) {
            const base = activeColumnFilters.filter((f) => f.id !== searchKey);
            return searchValue ? [...base, { id: searchKey, value: searchValue }] : base;
        }
        return activeColumnFilters;
    }, [searchValue, searchKey, activeColumnFilters]);

    const table = useLegacyTable<TData>({
        data,
        columns: columns as LegacyColumnDef<TData, unknown>[],
        state: {
            sorting,
            columnVisibility,
            rowSelection,
            columnFilters,
            pagination,
        },
        enableRowSelection: true,
        getRowId: getRowId
            ? (originalRow, index) => getRowId(originalRow as TData, index)
            : (row, i) =>
                  row && typeof row === 'object' && 'id' in row
                      ? String((row as Record<string, unknown>).id)
                      : String(i),
        onSortingChange,
        onColumnFiltersChange,
        onColumnVisibilityChange,
        onRowSelectionChange,
        onPaginationChange,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    const handleBulkDelete = async () => {
        if (!onDeleteSelected) return;
        const selected = table.getFilteredSelectedRowModel().rows.map((r) => r.original as TData);
        try {
            setIsDeleting(true);
            await onDeleteSelected(selected);
            table.resetRowSelection();
        } finally {
            setIsDeleting(false);
        }
    };

    const handleRowClick = (row: TData, e: React.MouseEvent) => {
        if (!onRowClick) return;
        // Don't navigate if clicking on interactive elements
        const target = e.target as HTMLElement;
        if (
            target.closest('button') ||
            target.closest('a') ||
            target.closest('input') ||
            target.closest('[role="checkbox"]') ||
            target.closest('[data-slot="dropdown-menu-trigger"]') ||
            target.closest('[data-slot="checkbox"]')
        ) {
            return;
        }
        onRowClick(row, e);
    };

    const scrollAreaRef = React.useRef<HTMLDivElement>(null);
    const pageIndex = table.getState().pagination.pageIndex;
    const pageSize = table.getState().pagination.pageSize;

    React.useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = 0;
        }
    }, [pageIndex, pageSize]);

    const filteredRowCount = table.getFilteredRowModel().rows.length;
    const totalDataCount = data.length;

    return (
        <div className={cn('flex-1 min-h-0 flex flex-col gap-4 w-full', className)}>
            {!hideToolbar && (
                <div className="shrink-0">
                    <DataTableToolbar
                        table={table}
                        searchKey={searchKey}
                        searchPlaceholder={searchPlaceholder}
                        searchValue={searchValue}
                        onSearchChange={onSearchChange}
                        filters={filters}
                        onDeleteSelected={handleBulkDelete}
                        deleteConfirmTitle={deleteConfirmTitle}
                        deleteConfirmDescription={deleteConfirmDescription}
                        isDeleting={isDeleting}
                    >
                        {toolbarActions}
                    </DataTableToolbar>
                </div>
            )}

            <div className="flex-1 min-h-0 flex flex-col rounded-lg border bg-card overflow-hidden">
                <Table
                    containerRef={scrollAreaRef}
                    containerClassName="flex-1 min-h-0 overflow-auto"
                >
                    <TableHeader className="sticky top-0 z-10 bg-muted shadow-[0_1px_0_0_hsl(var(--border))] [&_tr]:border-b-border [&_tr]:bg-muted">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id} className="hover:bg-muted border-b border-border bg-muted">
                                {headerGroup.headers.map((header) => {
                                    return (
                                        <TableHead key={header.id} colSpan={header.colSpan} className="h-10 [[data-density=compact]_&]:h-8 bg-muted">
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                      header.column.columnDef.header,
                                                      header.getContext()
                                                  )}
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            Array.from({ length: loadingRowsCount }).map((_, index) => (
                                <TableRow key={`skeleton-row-${index}`} className="h-12 [[data-density=compact]_&]:h-9">
                                    {columns.map((_, colIndex) => (
                                        <TableCell key={`skeleton-cell-${colIndex}`} className="h-12 [[data-density=compact]_&]:h-9 py-0">
                                            <Skeleton className="h-4 w-full max-w-[140px]" />
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : filteredRowCount > 0 ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && 'selected'}
                                    className={cn(
                                        'h-12 [[data-density=compact]_&]:h-9',
                                        onRowClick && 'cursor-pointer hover:bg-muted/50 transition-colors'
                                    )}
                                    onClick={(e) => handleRowClick(row.original as TData, e)}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id} className="h-12 [[data-density=compact]_&]:h-9 py-0">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : totalDataCount === 0 ? (
                            <TableRow className="hover:bg-transparent">
                                <TableCell
                                    colSpan={columns.length}
                                    className="h-72 text-center"
                                >
                                    {emptyState ?? (
                                        <div className="text-sm text-muted-foreground">
                                            No items found.
                                        </div>
                                    )}
                                </TableCell>
                            </TableRow>
                        ) : (
                            <TableRow className="hover:bg-transparent">
                                <TableCell
                                    colSpan={columns.length}
                                    className="h-72 text-center"
                                >
                                    {emptySearchState ?? (
                                        <div className="flex flex-col items-center justify-center gap-1 text-center">
                                            <p className="text-sm font-medium">
                                                No results for &apos;{searchValue || (table.getColumn(searchKey)?.getFilterValue() as string)}&apos;
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                Try checking for spelling errors or clearing your filter.
                                            </p>
                                        </div>
                                    )}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>

                {!hidePagination && (
                    <DataTablePagination table={table} pageSizeOptions={pageSizeOptions} />
                )}
            </div>
        </div>
    );
}

export { DataTableColumnHeader } from './data-table-column-header';
export { DataTableToolbar } from './data-table-toolbar';
export { DataTablePagination } from './data-table-pagination';
