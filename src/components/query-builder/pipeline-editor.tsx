"use client";

import React, { useRef, useEffect, useMemo, useState } from "react";
import { useQueryEditorStore } from "./store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DatabaseIcon, Wand2Icon, AlertCircleIcon, CheckCircle2Icon, InfoIcon } from "lucide-react";
import { validateMongoPipeline } from "@src/lib/query-engine/mongo/validate-pipeline";
import { ReadOnlyValidationError } from "@src/lib/connectors/errors";

export function PipelineEditor() {
  const {
    sql,
    setSql,
    runQuery,
    registerSqlInsertHandler,
    definition,
    setSourceTable,
    schema,
  } = useQueryEditorStore();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const [showStageHints, setShowStageHints] = useState(false);

  // Register insertion handler so right panel Schema browser can insert text at cursor
  useEffect(() => {
    const insertTextAtCursor = (textToInsert: string) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        setSql(sql ? `${sql} ${textToInsert}` : textToInsert);
        return;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = textarea.value.substring(0, start);
      const after = textarea.value.substring(end);
      const newText = `${before}${textToInsert}${after}`;
      setSql(newText);

      setTimeout(() => {
        textarea.focus();
        const newCursor = start + textToInsert.length;
        textarea.setSelectionRange(newCursor, newCursor);
      }, 10);
    };

    registerSqlInsertHandler(insertTextAtCursor);
    return () => {
      registerSqlInsertHandler(null);
    };
  }, [sql, setSql, registerSqlInsertHandler]);

  // Sync scroll between line numbers and textarea
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const lines = useMemo(() => {
    const count = (sql || "").split("\n").length;
    return Math.max(1, count);
  }, [sql]);

  // Client-side JSON & Pipeline validation
  const validation = useMemo<{ valid: boolean; error: string | null; line?: number }>(() => {
    const trimmed = (sql || "").trim();
    if (!trimmed) {
      return { valid: true, error: null };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid JSON";
      // Try to extract line number from message if available (e.g. at line X column Y)
      const match = /line\s+(\d+)/i.exec(msg);
      const lineNum = match ? parseInt(match[1], 10) : undefined;
      return { valid: false, error: `JSON Parse Error: ${msg}`, line: lineNum };
    }

    if (!Array.isArray(parsed)) {
      return {
        valid: false,
        error: "Pipeline must be a JSON array of stage objects, e.g. [{ $match: { ... } }]",
      };
    }

    try {
      validateMongoPipeline(parsed);
      return { valid: true, error: null };
    } catch (err) {
      if (err instanceof ReadOnlyValidationError) {
        return { valid: false, error: err.message };
      }
      return { valid: false, error: err instanceof Error ? err.message : "Validation failed" };
    }
  }, [sql]);

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(sql || "[]");
      setSql(JSON.stringify(parsed, null, 2));
    } catch {
      // ignore if invalid JSON
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void runQuery();
      return;
    }

    // Support Tab key for 2-space indentation
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = textarea.value.substring(0, start);
      const after = textarea.value.substring(end);
      setSql(`${before}  ${after}`);

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const collections = schema?.tables || [];

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden select-none">
      {/* Pipeline Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30 shrink-0 gap-3 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <DatabaseIcon className="size-3.5 text-muted-foreground shrink-0" />
          <span className="font-medium text-muted-foreground text-xs shrink-0">Collection:</span>
          <Select
            value={definition.source.table}
            items={collections.map((col) => ({ value: col.name, label: col.name }))}
            onValueChange={(val) => {
              if (val) setSourceTable(val);
            }}
          >
            <SelectTrigger className="h-7 w-48 text-xs bg-background">
              <SelectValue placeholder="Select collection..." />
            </SelectTrigger>
            <SelectContent>
              {collections.map((col) => (
                <SelectItem key={col.name} value={col.name} className="text-xs">
                  <span className="flex items-center gap-1.5">
                    <span>{col.name}</span>
                    {col.rowCountEstimate != null && (
                      <span className="text-[10px] text-muted-foreground">
                        (~{col.rowCountEstimate.toLocaleString()})
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {validation.error ? (
            <Badge variant="destructive" className="h-5 text-[10px] gap-1 px-1.5 font-normal">
              <AlertCircleIcon className="size-3" />
              <span>{validation.line ? `Error on line ${validation.line}` : "Invalid pipeline"}</span>
            </Badge>
          ) : sql.trim() ? (
            <Badge variant="outline" className="h-5 text-[10px] gap-1 px-1.5 text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800">
              <CheckCircle2Icon className="size-3" />
              <span>Valid pipeline</span>
            </Badge>
          ) : null}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleFormatJson}
            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
            title="Prettify JSON formatting"
          >
            <Wand2Icon className="size-3.5" />
            <span className="hidden sm:inline">Format</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowStageHints(!showStageHints)}
            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
            title="Toggle allowed stages hint"
          >
            <InfoIcon className="size-3.5" />
            <span className="hidden sm:inline">Stages</span>
          </Button>
        </div>
      </div>

      {/* Optional Allowed Stages Guide */}
      {showStageHints && (
        <div className="px-3 py-2 bg-muted/40 border-b text-[11px] text-muted-foreground flex flex-wrap gap-1.5 items-center shrink-0">
          <span className="font-medium text-foreground">Allowed stages:</span>
          {["$match", "$project", "$group", "$sort", "$skip", "$limit", "$unwind", "$lookup", "$addFields", "$set", "$unset", "$count", "$facet", "$sample"].map(
            (stage) => (
              <span key={stage} className="bg-background px-1.5 py-0.5 rounded border font-mono text-[10px]">
                {stage}
              </span>
            )
          )}
          <span className="text-[10px] text-rose-500 font-medium ml-1">
            (Mutations $out/$merge and JS $where/$function are blocked)
          </span>
        </div>
      )}

      {/* Error banner if invalid */}
      {validation.error && (
        <Alert variant="destructive" className="py-1.5 px-3 rounded-none border-x-0 border-t-0 text-xs shrink-0">
          <AlertCircleIcon className="size-3.5 shrink-0" />
          <AlertDescription className="text-xs font-mono truncate">
            {validation.error}
          </AlertDescription>
        </Alert>
      )}

      {/* Editor Main Area: Line Numbers + Textarea */}
      <div className="flex-1 min-h-0 relative flex bg-background font-mono text-xs">
        {/* Line Numbers Gutter */}
        <div
          ref={lineNumbersRef}
          className="w-10 py-3 pr-2 text-right bg-muted/20 text-muted-foreground/60 select-none overflow-hidden shrink-0 border-r leading-relaxed font-mono"
          aria-hidden="true"
        >
          {Array.from({ length: lines }).map((_, i) => (
            <div
              key={i + 1}
              className={`h-5 leading-5 text-[11px] ${
                validation.line === i + 1 ? "text-rose-500 font-bold bg-rose-500/10" : ""
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Textarea */}
        <div className="flex-1 min-w-0 relative h-full">
          <textarea
            ref={textareaRef}
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            placeholder={`[\n  {\n    "$match": {\n      "status": "delivered"\n    }\n  },\n  {\n    "$limit": 100\n  }\n]`}
            className="size-full resize-none font-mono text-xs leading-5 p-3 pl-3.5 bg-transparent text-foreground border-0 focus:outline-hidden focus:ring-0 overflow-auto select-text whitespace-pre"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
