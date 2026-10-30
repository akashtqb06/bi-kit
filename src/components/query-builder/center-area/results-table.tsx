"use client";

import React, { useMemo, useState, useCallback } from "react";
import { flexRender } from "@tanstack/react-table";
import {
  useLegacyTable,
  getCoreRowModel,
  type LegacyColumnDef,
} from "@tanstack/react-table/legacy";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MoreHorizontalIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  EyeOffIcon,
  CopyIcon,
  HashIcon,
  CalendarIcon,
  ToggleLeftIcon,
  TypeIcon,
  FileTextIcon,
  DatabaseIcon,
  PlayIcon,
  AlertTriangleIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryEditorStore } from "../store";

type RowType = (string | number | bigint | Buffer | null)[];

function getColumnTypeIcon(typeStr: string) {
  const t = typeStr.toLowerCase();
  if (t.includes("int") || t.includes("real") || t.includes("num") || t.includes("float") || t.includes("double")) {
    return HashIcon;
  }
  if (t.includes("date") || t.includes("time")) {
    return CalendarIcon;
  }
  if (t.includes("bool")) {
    return ToggleLeftIcon;
  }
  if (t.includes("text") || t.includes("char") || t.includes("varchar")) {
    return TypeIcon;
  }
  return FileTextIcon;
}

export function ResultsTable() {
  const {
    results,
    isRunning,
    runError,
    page,
    pageSize,
    definition,
    dataSourceId,
    updateStep,
    addStep,
  } = useQueryEditorStore();

  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());

  const resultColumns = results?.columns;
  const resultRows = results?.rows;

  const handleSortColumn = useCallback((columnName: string, dir: "asc" | "desc") => {
    // Check if an order step exists in definition
    const orderIndex = definition.steps.findIndex((s) => s.type === "order");
    if (orderIndex >= 0) {
      updateStep(orderIndex, {
        items: [{ column: columnName, dir }],
      });
    } else {
      addStep("order");
      // Set to the target column
      setTimeout(() => {
        const idx = useQueryEditorStore.getState().definition.steps.findIndex((s) => s.type === "order");
        if (idx >= 0) {
          updateStep(idx, { items: [{ column: columnName, dir }] });
        }
      }, 50);
    }
  }, [definition.steps, updateStep, addStep]);

  const handleHideColumn = (columnName: string) => {
    setHiddenColumns((prev) => new Set([...prev, columnName]));
    toast.info(`Column "${columnName}" hidden in view`);
  };

  const handleCopyName = (columnName: string) => {
    navigator.clipboard.writeText(columnName);
    toast.success(`Copied "${columnName}" to clipboard`);
  };

  const columns = useMemo<LegacyColumnDef<RowType>[]>(() => {
    if (!resultColumns) return [];

    return resultColumns
      .filter((col) => !hiddenColumns.has(col.name))
      .map((col, colIdx) => {
        const Icon = getColumnTypeIcon(col.type);

        return {
          id: `${col.name}_${colIdx}`,
          header: () => (
            <div className="flex items-center justify-between gap-2 group/header w-full">
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon className="size-3.5 text-muted-foreground/70 shrink-0" />
                <span className="font-semibold text-xs text-foreground truncate">
                  {col.name}
                </span>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className="size-5 rounded flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-muted opacity-0 group-hover/header:opacity-100 transition-opacity"
                    />
                  }
                >
                  <MoreHorizontalIcon className="size-3.5" />
                  <span className="sr-only">Column actions</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem onClick={() => handleSortColumn(col.name, "asc")}>
                    <ArrowUpIcon className="mr-2 size-3.5 text-muted-foreground" />
                    Sort asc
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSortColumn(col.name, "desc")}>
                    <ArrowDownIcon className="mr-2 size-3.5 text-muted-foreground" />
                    Sort desc
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleHideColumn(col.name)}>
                    <EyeOffIcon className="mr-2 size-3.5 text-muted-foreground" />
                    Hide column
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleCopyName(col.name)}>
                    <CopyIcon className="mr-2 size-3.5 text-muted-foreground" />
                    Copy name
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ),
          accessorFn: (row: RowType) => row[colIdx],
          cell: ({ getValue }: { getValue: () => unknown }) => {
            const val = getValue();
            if (val === null || val === undefined) {
              return <span className="text-muted-foreground/40 italic">null</span>;
            }
            if (typeof val === "boolean") {
              return val ? "true" : "false";
            }
            return <span className="truncate">{String(val)}</span>;
          },
        };
      });
  }, [resultColumns, hiddenColumns, handleSortColumn]);

  const data = useMemo<RowType[]>(() => {
    return (resultRows as RowType[]) || [];
  }, [resultRows]);

  const table = useLegacyTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex-1 min-h-0 min-w-0 p-3 flex flex-col overflow-hidden bg-muted/10">
      {/* Rounded border card containing table with horizontal & vertical scroll */}
      <div className="flex-1 min-h-0 min-w-0 rounded-lg border bg-card overflow-hidden flex flex-col relative shadow-xs">
        {/* Truncation notice banner */}
        {!isRunning && results && results.truncated && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-800 dark:text-amber-400 text-xs shrink-0 select-none">
            <AlertTriangleIcon className="size-3.5 shrink-0" />
            <span className="font-medium">
              Result set truncated to {results.rowCount.toLocaleString()} rows (maximum query limit reached).
            </span>
          </div>
        )}

        {/* Loading state */}
        {isRunning && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-6 w-20" />
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        )}

        {/* Empty state: Not executed yet */}
        {!isRunning && !runError && !results && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center select-none">
            <div className="size-11 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
              {!dataSourceId ? (
                <DatabaseIcon className="size-5" />
              ) : (
                <PlayIcon className="size-5 ml-0.5" />
              )}
            </div>
            <p className="text-sm font-semibold text-foreground">
              {!dataSourceId ? "Select a data source to start" : "No data to display"}
            </p>
            <p className="text-xs text-muted-foreground max-w-sm mt-1">
              {!dataSourceId
                ? "Choose a data source from the panel to begin building your query."
                : "Select a source table or click \"Execute\" to run your query and view results."}
            </p>
          </div>
        )}

        {/* Empty results: 0 rows */}
        {!isRunning && !runError && results && results.rowCount === 0 && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center select-none">
            <DatabaseIcon className="size-8 text-muted-foreground/40 mb-2" />
            <p className="text-xs font-medium text-muted-foreground">
              Query executed successfully, but returned 0 rows.
            </p>
          </div>
        )}

        {/* TanStack Table Grid */}
        {!isRunning && !runError && results && results.rowCount > 0 && (
          <div className="flex-1 min-h-0 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10 border-b shadow-xs">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="hover:bg-transparent">
                    {/* Narrow row-number column on left */}
                    <TableHead className="w-12 text-center text-muted-foreground font-mono text-[10px] select-none bg-card sticky left-0 z-20 border-r">
                      #
                    </TableHead>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className="px-3 py-2 border-r last:border-r-0"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row, rowIdx) => {
                  const rowNumber = (page - 1) * pageSize + rowIdx + 1;
                  return (
                    <TableRow key={row.id} className="hover:bg-muted/40 text-xs">
                      {/* Narrow row-number cell */}
                      <TableCell className="w-12 text-center text-muted-foreground font-mono text-[10px] select-none bg-muted/20 border-r sticky left-0 z-1">
                        {rowNumber}
                      </TableCell>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className="px-3 py-1.5 font-mono text-xs border-r last:border-r-0 truncate max-w-sm"
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

