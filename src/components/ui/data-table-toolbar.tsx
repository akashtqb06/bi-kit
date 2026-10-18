'use client';

import * as React from 'react';
import type { RowData } from '@tanstack/react-table';
import type { LegacyReactTable } from '@tanstack/react-table/legacy';
import { SearchIcon, SlidersHorizontalIcon, Trash2Icon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DataTableToolbarProps<TData extends RowData> {
    table: LegacyReactTable<TData>;
    searchKey?: string;
    searchPlaceholder?: string;
    searchValue?: string;
    onSearchChange?: (val: string) => void;
    filters?: React.ReactNode;
    onDeleteSelected?: () => Promise<void> | void;
    deleteConfirmTitle?: string;
    deleteConfirmDescription?: string;
    isDeleting?: boolean;
    children?: React.ReactNode;
}

export function DataTableToolbar<TData extends RowData>({
    table,
    searchKey = 'name',
    searchPlaceholder = 'Filter workbooks...',
    searchValue,
    onSearchChange,
    filters,
    onDeleteSelected,
    deleteConfirmTitle,
    deleteConfirmDescription,
    isDeleting = false,
    children,
}: DataTableToolbarProps<TData>) {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    const selectedCount = selectedRows.length;
    const [confirmOpen, setConfirmOpen] = React.useState(false);

    // Controlled or uncontrolled search with debounce
    const currentFilterValue =
        searchValue !== undefined
            ? searchValue
            : ((table.getColumn(searchKey)?.getFilterValue() as string) ?? '');

    const [prevFilterValue, setPrevFilterValue] = React.useState(currentFilterValue);
    const [localQuery, setLocalQuery] = React.useState(currentFilterValue);

    if (prevFilterValue !== currentFilterValue) {
        setPrevFilterValue(currentFilterValue);
        setLocalQuery(currentFilterValue);
    }

    React.useEffect(() => {
        const timer = setTimeout(() => {
            if (localQuery !== currentFilterValue) {
                if (onSearchChange) {
                    onSearchChange(localQuery);
                } else {
                    table.getColumn(searchKey)?.setFilterValue(localQuery || undefined);
                }
            }
        }, 250);

        return () => clearTimeout(timer);
    }, [localQuery, currentFilterValue, onSearchChange, searchKey, table]);

    // When rows are selected, replace toolbar with selection bar
    if (selectedCount > 0) {
        return (
            <>
                <div className="flex h-9 items-center justify-between rounded-lg bg-muted/60 px-3 py-1 text-sm border border-border">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-xs sm:text-sm">
                            {selectedCount} selected
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setConfirmOpen(true)}
                            disabled={isDeleting}
                        >
                            <Trash2Icon className="mr-1.5 size-3.5" />
                            Delete
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => table.resetRowSelection()}
                            disabled={isDeleting}
                        >
                            Clear
                        </Button>
                    </div>
                </div>

                <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {deleteConfirmTitle ?? `Delete ${selectedCount} selected ${selectedCount === 1 ? 'item' : 'items'}?`}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {deleteConfirmDescription ??
                                    `This action cannot be undone. This will permanently delete the selected ${selectedCount} ${selectedCount === 1 ? 'item' : 'items'} and all dependent queries, charts, and dashboards.`}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                variant="destructive"
                                disabled={isDeleting}
                                onClick={async (e) => {
                                    e.preventDefault();
                                    if (onDeleteSelected) {
                                        await onDeleteSelected();
                                    }
                                    setConfirmOpen(false);
                                }}
                            >
                                Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </>
        );
    }

    return (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
                <div className="relative flex-1 sm:max-w-xs">
                    <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                        placeholder={searchPlaceholder}
                        value={localQuery}
                        onChange={(e) => setLocalQuery(e.target.value)}
                        className="h-9 pl-8 text-xs sm:text-sm"
                    />
                </div>
                {filters}
            </div>

            <div className="flex items-center gap-2">
                {children}
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={
                            <Button
                                variant="outline"
                                size="sm"
                                className="ml-auto h-9 text-xs font-normal"
                            />
                        }
                    >
                        <SlidersHorizontalIcon className="mr-1.5 size-3.5" />
                        Columns
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {table
                            .getAllColumns()
                            .filter(
                                (column) =>
                                    typeof column.accessorFn !== 'undefined' && column.getCanHide()
                            )
                            .map((column) => {
                                return (
                                    <DropdownMenuCheckboxItem
                                        key={column.id}
                                        className="capitalize text-xs"
                                        checked={column.getIsVisible()}
                                        onCheckedChange={(value) => column.toggleVisibility(!!value)}
                                    >
                                        {column.id}
                                    </DropdownMenuCheckboxItem>
                                );
                            })}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}
