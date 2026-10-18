"use client";

import { useMemo } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircleIcon,
  ClockIcon,
  DatabaseIcon,
  PlayIcon,
  TableIcon,
} from "lucide-react";
import { useQueryEditorStore } from "./store";

export function ResultsView() {
  const { results, isRunning, runError } = useQueryEditorStore();

  type RowType = (string | number | bigint | Buffer | null)[];

  const resultColumns = results?.columns;
  const resultRows = results?.rows;

  const columns = useMemo<LegacyColumnDef<RowType>[]>(() => {
    if (!resultColumns) return [];
    return resultColumns.map((col, colIdx) => ({
      id: `${col.name}_${colIdx}`,
      header: () => (
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="font-semibold text-xs text-foreground">
            {col.name}
          </span>
          <Badge
            variant="outline"
            className="text-[9px] px-1 py-0 h-4 font-mono font-normal uppercase"
          >
            {col.type}
          </Badge>
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
    }));
  }, [resultColumns]);

  const data = useMemo<RowType[]>(() => {
    return (resultRows as RowType[]) || [];
  }, [resultRows]);

  const table = useLegacyTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Results Header Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/20 shrink-0 text-xs">
        <div className="flex items-center gap-2">
          <TableIcon className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-foreground">Results</span>
          {results && (
            <span className="text-muted-foreground">
              — {results.rowCount.toLocaleString()} row
              {results.rowCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {results?.truncated && (
            <Badge variant="secondary" className="text-[10px]">
              Truncated to 1,000 rows
            </Badge>
          )}

          {results && (
            <div className="flex items-center gap-1 text-muted-foreground text-[11px] font-mono">
              <ClockIcon className="size-3" />
              <span>{results.durationMs}ms</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-auto">
        {/* Error State */}
        {runError && (
          <div className="p-4">
            <Alert variant="destructive">
              <AlertCircleIcon className="size-4" />
              <AlertTitle>Query Execution Error</AlertTitle>
              <AlertDescription className="text-xs whitespace-pre-wrap font-mono mt-1">
                {runError}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Loading Skeleton */}
        {isRunning && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-28" />
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isRunning && !runError && !results && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="size-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
              <PlayIcon className="size-5 ml-0.5" />
            </div>
            <p className="text-sm font-medium text-foreground">No data to display</p>
            <p className="text-xs text-muted-foreground max-w-sm mt-1">
              Click the &quot;Run&quot; button above or press ⌘/Ctrl+Enter to execute the query and view results.
            </p>
          </div>
        )}

        {/* Empty Result Rows */}
        {!isRunning && !runError && results && results.rowCount === 0 && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <DatabaseIcon className="size-8 text-muted-foreground/40 mb-2" />
            <p className="text-xs font-medium text-muted-foreground">
              Query executed successfully, but returned 0 rows.
            </p>
          </div>
        )}

        {/* TanStack Table Result View */}
        {!isRunning && !runError && results && results.rowCount > 0 && (
          <div className="relative">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10 shadow-xs">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    <TableHead className="w-10 text-[10px] text-muted-foreground font-mono px-2 text-center">
                      #
                    </TableHead>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} className="px-3 py-2">
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
                {table.getRowModel().rows.map((row, rowIdx) => (
                  <TableRow key={row.id} className="hover:bg-muted/40 text-xs">
                    <TableCell className="w-10 text-[10px] text-muted-foreground font-mono px-2 text-center bg-muted/10 select-none">
                      {rowIdx + 1}
                    </TableCell>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="px-3 py-1.5 font-mono text-xs">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
