"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { format } from "date-fns";
import type { QueryResultData } from "@src/components/query-builder/store";
import type { DashboardFilter } from "@src/lib/schemas";
import type { QueryStep } from "@src/lib/query-engine/definition";

export interface QueryCacheItem {
  data: QueryResultData | null;
  loading: boolean;
  error: string | null;
  lastFetchedAt: number;
}

export type AutoRefreshInterval = "off" | "30s" | "1m" | "5m";

const INTERVAL_MS: Record<AutoRefreshInterval, number> = {
  off: 0,
  "30s": 30_000,
  "1m": 60_000,
  "5m": 300_000,
};

const STALE_TIME_MS = 60_000;

interface QueryDefinition {
  id: string;
  dataSourceId: string | null;
  mode: "builder" | "sql" | "pipeline";
  definition: string;
  sql: string;
}

// ---------------------------------------------------------------------------
// Helpers: Column checking and filter step generation
// ---------------------------------------------------------------------------

function checkQueryContainsColumn(
  builderDef: { source: { table: string }; steps: QueryStep[] },
  columnName: string,
  knownColumns?: string[]
): boolean {
  const target = columnName.toLowerCase();

  // Check known columns from previous results
  if (knownColumns && knownColumns.some((c) => c.toLowerCase() === target)) {
    return true;
  }

  // Check definition steps
  const defStr = JSON.stringify(builderDef).toLowerCase();
  if (
    defStr.includes(`"${target}"`) ||
    defStr.includes(`:${target}`) ||
    defStr.includes(target)
  ) {
    return true;
  }

  return false;
}

function checkSqlContainsColumn(sql: string, columnName: string): boolean {
  return new RegExp(`\\b${columnName}\\b`, "i").test(sql);
}

function buildFilterStep(
  filter: DashboardFilter,
  value: unknown
): QueryStep | null {
  if (filter.type === "date_range") {
    const range = value as { from?: Date | string; to?: Date | string } | null;
    if (!range) return null;

    if (range.from && range.to) {
      const fromStr = format(new Date(range.from), "yyyy-MM-dd");
      const toStr = format(new Date(range.to), "yyyy-MM-dd");
      return {
        type: "filter",
        conditions: {
          logic: "and",
          items: [
            {
              column: filter.column,
              op: "between",
              value: [fromStr, `${toStr} 23:59:59`],
            },
          ],
        },
      };
    } else if (range.from) {
      const fromStr = format(new Date(range.from), "yyyy-MM-dd");
      return {
        type: "filter",
        conditions: {
          logic: "and",
          items: [{ column: filter.column, op: ">=", value: fromStr }],
        },
      };
    } else if (range.to) {
      const toStr = format(new Date(range.to), "yyyy-MM-dd");
      return {
        type: "filter",
        conditions: {
          logic: "and",
          items: [
            { column: filter.column, op: "<=", value: `${toStr} 23:59:59` },
          ],
        },
      };
    }
    return null;
  }

  if (filter.type === "select") {
    if (
      value === undefined ||
      value === null ||
      value === "" ||
      value === "__all__"
    ) {
      return null;
    }
    return {
      type: "filter",
      conditions: {
        logic: "and",
        items: [{ column: filter.column, op: "=", value: String(value) }],
      },
    };
  }

  return null;
}

function buildSqlFilterCondition(
  filter: DashboardFilter,
  value: unknown
): string | null {
  const col = `"${filter.column.replace(/"/g, '""')}"`;

  if (filter.type === "date_range") {
    const range = value as { from?: Date | string; to?: Date | string } | null;
    if (!range) return null;

    if (range.from && range.to) {
      const fromStr = format(new Date(range.from), "yyyy-MM-dd");
      const toStr = format(new Date(range.to), "yyyy-MM-dd");
      return `${col} BETWEEN '${fromStr}' AND '${toStr} 23:59:59'`;
    } else if (range.from) {
      const fromStr = format(new Date(range.from), "yyyy-MM-dd");
      return `${col} >= '${fromStr}'`;
    } else if (range.to) {
      const toStr = format(new Date(range.to), "yyyy-MM-dd");
      return `${col} <= '${toStr} 23:59:59'`;
    }
    return null;
  }

  if (filter.type === "select") {
    if (
      value === undefined ||
      value === null ||
      value === "" ||
      value === "__all__"
    ) {
      return null;
    }
    const safeVal = String(value).replace(/'/g, "''");
    return `${col} = '${safeVal}'`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Hook: useDashboardQueryRunner
// ---------------------------------------------------------------------------

export function useDashboardQueryRunner(
  queries: QueryDefinition[],
  activeQueryIds: string[],
  autoRefresh: AutoRefreshInterval,
  dashboardFilters: DashboardFilter[] = [],
  filterValues: Record<string, unknown> = {}
) {
  // Query results cache keyed by queryId
  const [cache, setCache] = useState<Record<string, QueryCacheItem>>({});

  // Known column names learned from execution results
  const knownColumnsRef = useRef<Map<string, string[]>>(new Map());

  // In-flight promise map to deduplicate concurrent requests for the same query
  const inFlightRef = useRef<Map<string, Promise<QueryResultData | null>>>(new Map());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const executedOnLandRef = useRef<Set<string>>(new Set());

  // Clean up in-flight requests on unmount
  useEffect(() => {
    const controllers = abortControllersRef.current;
    return () => {
      controllers.forEach((c) => c.abort());
      controllers.clear();
    };
  }, []);

  // Serialize active filter values to detect changes
  const activeFiltersKey = JSON.stringify(filterValues);

  // Execute a single query against /api/queries/run with injected dashboard filters
  const runQuery = useCallback(
    async (queryId: string, force = false, signal?: AbortSignal): Promise<QueryResultData | null> => {
      const q = queries.find((item) => item.id === queryId);
      if (!q) {
        setCache((prev) => ({
          ...prev,
          [queryId]: {
            data: null,
            loading: false,
            error: "Query not found in workbook",
            lastFetchedAt: Date.now(),
          },
        }));
        return null;
      }

      if (!q.dataSourceId) {
        setCache((prev) => ({
          ...prev,
          [queryId]: {
            data: null,
            loading: false,
            error: "Query has no data source assigned",
            lastFetchedAt: Date.now(),
          },
        }));
        return null;
      }

      // Check cache freshness unless force is requested
      const existing = cache[queryId];
      if (
        !force &&
        existing?.data &&
        Date.now() - existing.lastFetchedAt < STALE_TIME_MS
      ) {
        return existing.data;
      }

      // Deduplicate if already in flight
      const existingPromise = inFlightRef.current.get(queryId);
      if (existingPromise) {
        return existingPromise;
      }

      // Set loading state in cache (preserve existing data for smooth SWR revalidation)
      setCache((prev) => ({
        ...prev,
        [queryId]: {
          data: prev[queryId]?.data || null,
          loading: true,
          error: null,
          lastFetchedAt: prev[queryId]?.lastFetchedAt || 0,
        },
      }));

      const controller = new AbortController();
      abortControllersRef.current.get(queryId)?.abort();
      abortControllersRef.current.set(queryId, controller);

      if (signal) {
        if (signal.aborted) {
          controller.abort();
        } else {
          signal.addEventListener("abort", () => controller.abort(), { once: true });
        }
      }

      // Create new execution promise
      const execPromise = (async () => {
        try {
          let def: unknown = undefined;
          let sqlToRun = q.sql;

          const knownCols = knownColumnsRef.current.get(queryId) || [];

          if (q.mode === "builder" && q.definition) {
            try {
              const parsed = JSON.parse(q.definition) as {
                source: { table: string };
                steps: QueryStep[];
              };

              // Inject matching dashboard filters into builder steps
              if (parsed && parsed.steps && Array.isArray(parsed.steps)) {
                for (const filter of dashboardFilters) {
                  const val = filterValues[filter.id];
                  if (
                    val === undefined ||
                    val === null ||
                    val === "" ||
                    val === "__all__"
                  ) {
                    continue;
                  }

                  if (checkQueryContainsColumn(parsed, filter.column, knownCols)) {
                    const step = buildFilterStep(filter, val);
                    if (step) {
                      // Insert before summarize if present, else before limit, else append
                      const sumIdx = parsed.steps.findIndex(
                        (s) => s.type === "summarize"
                      );
                      if (sumIdx !== -1) {
                        parsed.steps.splice(sumIdx, 0, step);
                      } else {
                        const limitIdx = parsed.steps.findIndex(
                          (s) => s.type === "limit"
                        );
                        if (limitIdx !== -1) {
                          parsed.steps.splice(limitIdx, 0, step);
                        } else {
                          parsed.steps.push(step);
                        }
                      }
                    }
                  }
                }
              }

              def = parsed;
            } catch {
              def = undefined;
            }
          } else if (q.mode === "sql" && q.sql) {
            // In SQL mode, wrap subquery if column is referenced
            for (const filter of dashboardFilters) {
              const val = filterValues[filter.id];
              if (
                val === undefined ||
                val === null ||
                val === "" ||
                val === "__all__"
              ) {
                continue;
              }

              if (checkSqlContainsColumn(q.sql, filter.column)) {
                const cond = buildSqlFilterCondition(filter, val);
                if (cond) {
                  sqlToRun = `SELECT * FROM (${sqlToRun}) AS __dash_filter WHERE ${cond}`;
                }
              }
            }
          }

          const res = await fetch("/api/queries/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              dataSourceId: q.dataSourceId,
              mode: q.mode,
              definition: def,
              sql: sqlToRun,
            }),
          });

          const json = await res.json();
          if (!res.ok) {
            throw new Error(
              json.error?.message || json.message || "Failed to execute query"
            );
          }

          const result: QueryResultData = json.data;

          // Record known output column names for future filter detection
          if (result.columns && Array.isArray(result.columns)) {
            const colNames = result.columns.map((c) => c.name);
            knownColumnsRef.current.set(queryId, colNames);
          }

          setCache((prev) => ({
            ...prev,
            [queryId]: {
              data: result,
              loading: false,
              error: null,
              lastFetchedAt: Date.now(),
            },
          }));
          return result;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            return null;
          }
          const errorMsg =
            err instanceof Error ? err.message : "Query execution failed";
          setCache((prev) => ({
            ...prev,
            [queryId]: {
              data: prev[queryId]?.data || null,
              loading: false,
              error: errorMsg,
              lastFetchedAt: Date.now(),
            },
          }));
          throw err;
        } finally {
          if (abortControllersRef.current.get(queryId) === controller) {
            abortControllersRef.current.delete(queryId);
          }
          inFlightRef.current.delete(queryId);
        }
      })();

      inFlightRef.current.set(queryId, execPromise);
      return execPromise;
    },
    [queries, cache, dashboardFilters, filterValues]
  );

  // Re-run all queries currently on the dashboard
  const refetchAll = useCallback(async () => {
    const uniqueIds = Array.from(new Set(activeQueryIds)).filter(Boolean);
    await Promise.allSettled(uniqueIds.map((id) => runQuery(id, true)));
  }, [activeQueryIds, runQuery]);

  // Re-run a specific query
  const refetchQuery = useCallback(
    async (queryId: string) => {
      await runQuery(queryId, true);
    },
    [runQuery]
  );

  // When active filter values change, re-run all dashboard queries with the new filter parameters
  useEffect(() => {
    if (queries.length === 0) return;
    const uniqueIds = Array.from(new Set(activeQueryIds)).filter(Boolean);
    if (uniqueIds.length > 0) {
      void Promise.allSettled(uniqueIds.map((id) => runQuery(id, true)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFiltersKey]);

  // Automatically fetch any active queries missing from cache on initial load
  useEffect(() => {
    if (queries.length === 0) return;
    const uniqueIds = Array.from(new Set(activeQueryIds)).filter(Boolean);
    for (const id of uniqueIds) {
      if (!cache[id] && !inFlightRef.current.has(id) && !executedOnLandRef.current.has(id)) {
        executedOnLandRef.current.add(id);
        void runQuery(id, false);
      }
    }
  }, [activeQueryIds, queries, cache, runQuery]);

  // Auto-refresh timer
  useEffect(() => {
    const ms = INTERVAL_MS[autoRefresh];
    if (ms <= 0) return;

    const timer = setInterval(() => {
      void refetchAll();
    }, ms);

    return () => clearInterval(timer);
  }, [autoRefresh, refetchAll]);

  return {
    cache,
    runQuery,
    refetchAll,
    refetchQuery,
  };
}
