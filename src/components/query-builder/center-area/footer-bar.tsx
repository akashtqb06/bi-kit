"use client";

import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
} from "lucide-react";
import { toast } from "sonner";
import { buildCsvContent, downloadCsv } from "@src/lib/utils";
import { useQueryEditorStore } from "../store";

export function FooterBar() {
  const { results, isRunning, page, pageSize, totalRows, setPage, queryName } =
    useQueryEditorStore();

  const totalPages = useMemo(() => {
    if (!totalRows || pageSize <= 0) return 1;
    return Math.ceil(totalRows / pageSize);
  }, [totalRows, pageSize]);

  const rowRangeText = useMemo(() => {
    if (!results || results.rowCount === 0 || totalRows === 0) {
      return "Showing 0 rows";
    }
    const start = (page - 1) * pageSize + 1;
    const end = Math.min((page - 1) * pageSize + results.rowCount, totalRows);
    return `Showing ${start}-${end} of ${totalRows.toLocaleString()} rows`;
  }, [results, page, pageSize, totalRows]);

  const handleDownloadCsv = () => {
    if (!results || results.rows.length === 0) {
      toast.error("No data to download");
      return;
    }

    const csvContent = buildCsvContent(results.columns, results.rows);
    downloadCsv(`${queryName || "query-results"}-page-${page}.csv`, csvContent);
    toast.success("CSV downloaded");
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 border-t bg-card text-xs text-muted-foreground shrink-0 select-none">
      {/* Left: "Showing 1-100 of N rows" */}
      <div className="font-medium">{rowRangeText}</div>

      {/* Right: Prev/Next pager + Download CSV icon */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            onClick={() => void setPage(page - 1)}
            disabled={page <= 1 || isRunning}
            className="size-7 text-muted-foreground hover:text-foreground"
            title="Previous page"
          >
            <ChevronLeftIcon className="size-3.5" />
          </Button>

          <span className="font-medium text-foreground px-1 text-xs">
            Page {page} {totalPages > 1 && `of ${totalPages}`}
          </span>

          <Button
            variant="outline"
            size="icon"
            onClick={() => void setPage(page + 1)}
            disabled={page >= totalPages || isRunning}
            className="size-7 text-muted-foreground hover:text-foreground"
            title="Next page"
          >
            <ChevronRightIcon className="size-3.5" />
          </Button>
        </div>

        <div className="h-4 w-px bg-border mx-1" />

        <Button
          variant="outline"
          size="icon"
          onClick={handleDownloadCsv}
          disabled={!results || results.rowCount === 0}
          className="size-7 text-muted-foreground hover:text-foreground"
          title="Download CSV"
        >
          <DownloadIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

