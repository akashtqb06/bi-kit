"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PlayIcon,
  SlidersHorizontalIcon,
  Code2Icon,
  DatabaseIcon,
  Loader2Icon,
  CheckIcon,
} from "lucide-react";
import { useQueryEditorStore } from "./store";

export function QueryHeader() {
  const {
    queryName,
    setQueryName,
    dataSourceId,
    setDataSourceId,
    dataSources,
    mode,
    setMode,
    runQuery,
    isRunning,
    isSaving,
    isDirty,
    lastSavedAt,
  } = useQueryEditorStore();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b bg-card shrink-0">
      {/* Left: Query Name & Data Source */}
      <div className="flex items-center gap-3 flex-1 min-w-64">
        <Input
          value={queryName}
          onChange={(e) => setQueryName(e.target.value)}
          placeholder="Untitled Query"
          className="h-8 max-w-xs font-medium text-sm border-transparent hover:border-input focus-visible:border-input transition-colors bg-transparent px-2 shadow-none"
        />

        {/* Data Source Selector */}
        <div className="flex items-center gap-1.5">
          <DatabaseIcon className="size-3.5 text-muted-foreground shrink-0" />
          <Select
            value={dataSourceId}
            onValueChange={(val) => {
              if (val) void setDataSourceId(val);
            }}
          >
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Select data source..." />
            </SelectTrigger>
            <SelectContent>
              {dataSources.map((ds) => (
                <SelectItem key={ds.id} value={ds.id} className="text-xs">
                  <span className="font-medium">{ds.name}</span>{" "}
                  <span className="text-muted-foreground uppercase text-[10px]">
                    ({ds.type})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Save status */}
        <div className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground">
          {isSaving ? (
            <span className="flex items-center gap-1">
              <Loader2Icon className="size-3 animate-spin text-muted-foreground" />
              Saving...
            </span>
          ) : isDirty ? (
            <span className="flex items-center gap-1 text-amber-500">
              <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
              Unsaved
            </span>
          ) : lastSavedAt ? (
            <span className="flex items-center gap-1 text-muted-foreground/70">
              <CheckIcon className="size-3 text-emerald-500" />
              Saved
            </span>
          ) : null}
        </div>
      </div>

      {/* Right: Mode Tabs & Run Button */}
      <div className="flex items-center gap-3 shrink-0">
        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as "builder" | "sql")}
          className="h-8"
        >
          <TabsList className="h-8 p-0.5 bg-muted">
            <TabsTrigger
              value="builder"
              className="h-7 px-3 text-xs gap-1.5 data-active:bg-background shadow-xs font-medium"
            >
              <SlidersHorizontalIcon className="size-3.5" />
              Builder
            </TabsTrigger>
            <TabsTrigger
              value="sql"
              className="h-7 px-3 text-xs gap-1.5 data-active:bg-background shadow-xs font-medium"
            >
              <Code2Icon className="size-3.5" />
              SQL
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Run Query Button */}
        <Button
          type="button"
          onClick={() => void runQuery()}
          disabled={isRunning || !dataSourceId}
          size="sm"
          className="h-8 gap-1.5 font-medium text-xs px-3 shadow-xs"
        >
          {isRunning ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <PlayIcon className="size-3.5 fill-current" />
          )}
          <span>{isRunning ? "Running..." : "Run"}</span>
          <kbd className="hidden md:inline-flex ml-1 items-center rounded bg-primary-foreground/20 px-1 py-0.5 text-[9px] font-mono leading-none">
            ⌘↵
          </kbd>
        </Button>
      </div>
    </div>
  );
}
