"use client";

import React from "react";
import { StatusBar } from "./status-bar";
import { ResultsTable } from "./results-table";
import { FooterBar } from "./footer-bar";
import { SqlEditor } from "../sql-view";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertCircleIcon } from "lucide-react";
import { useQueryEditorStore } from "../store";

export function CenterArea() {
  const { mode, runError } = useQueryEditorStore();

  if (mode === "sql") {
    return (
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-background">
        {/* 1. Status bar row with mode toggle and actions */}
        <StatusBar />

        {/* 2. SQL mode center layout: ResizablePanelGroup vertical */}
        <ResizablePanelGroup direction="vertical" className="flex-1 min-h-0">
          {/* Top: SQL Editor */}
          <ResizablePanel defaultSize={45} minSize={20} className="flex flex-col min-h-0">
            <SqlEditor />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Bottom: Results grid with validation / database error alert */}
          <ResizablePanel defaultSize={55} minSize={20} className="flex flex-col min-h-0">
            {runError && (
              <div className="p-3 border-b bg-destructive/10 shrink-0">
                <Alert variant="destructive" className="py-2 px-3 text-xs">
                  <AlertCircleIcon className="size-4 shrink-0" />
                  <div className="ml-2">
                    <AlertTitle className="text-xs font-semibold">
                      SQL Execution Error
                    </AlertTitle>
                    <AlertDescription className="text-xs font-mono mt-0.5 whitespace-pre-wrap">
                      {runError}
                    </AlertDescription>
                  </div>
                </Alert>
              </div>
            )}
            <ResultsTable />
            <FooterBar />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-background">
      {/* 1. Status bar row */}
      <StatusBar />

      {/* 2. Results grid (filling remaining height) */}
      <ResultsTable />

      {/* 3. Footer bar pinned under table */}
      <FooterBar />
    </div>
  );
}
