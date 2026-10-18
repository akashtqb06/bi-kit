"use client";

import React, { useRef, useEffect, useMemo } from "react";
import { useQueryEditorStore } from "./store";

export function SqlEditor() {
  const { sql, setSql, runQuery, registerSqlInsertHandler } = useQueryEditorStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

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

      // Restore focus and cursor position after insert
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

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden select-none">
      {/* Editor Main Area: Line Numbers + Textarea */}
      <div className="flex-1 min-h-0 relative flex bg-background font-mono text-xs">
        {/* Line Numbers Gutter */}
        <div
          ref={lineNumbersRef}
          className="w-10 py-3 pr-2 text-right bg-muted/20 text-muted-foreground/60 select-none overflow-hidden shrink-0 border-r leading-relaxed font-mono"
          aria-hidden="true"
        >
          {Array.from({ length: lines }).map((_, i) => (
            <div key={i + 1} className="h-5 leading-5 text-[11px]">
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
            placeholder="-- Write your SQL query here (SELECT only)&#10;SELECT * FROM orders LIMIT 100;"
            className="size-full resize-none font-mono text-xs leading-5 p-3 pl-3.5 bg-transparent text-foreground border-0 focus:outline-hidden focus:ring-0 overflow-auto select-text whitespace-pre"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}

export { SqlEditor as SqlView };
