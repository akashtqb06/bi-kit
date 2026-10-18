"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { WorkbookPublic } from "@src/lib/workbooks/service";
import type { QueryPublic } from "@src/lib/queries/service";
import type { ChartPublic } from "@src/lib/charts/service";
import type { DashboardPublic } from "@src/lib/dashboards/service";
import { defaultChartConfig } from "@src/lib/schemas";

interface WorkbookContextType {
  workbookId: string;
  workbook: WorkbookPublic | null;
  queries: QueryPublic[];
  charts: ChartPublic[];
  dashboards: DashboardPublic[];
  loading: boolean;
  error: string | null;
  refreshWorkbook: () => Promise<void>;
  // Workbook actions
  renameWorkbook: (newName: string) => Promise<void>;
  duplicateWorkbook: () => Promise<void>;
  deleteWorkbook: () => Promise<void>;
  // Query actions
  addQuery: () => Promise<string | undefined>;
  renameQuery: (id: string, newName: string) => Promise<void>;
  duplicateQuery: (id: string) => Promise<void>;
  deleteQuery: (id: string) => Promise<void>;
  // Chart actions
  addChart: () => Promise<string | undefined>;
  renameChart: (id: string, newName: string) => Promise<void>;
  duplicateChart: (id: string) => Promise<void>;
  deleteChart: (id: string) => Promise<void>;
  // Dashboard actions
  addDashboard: () => Promise<string | undefined>;
  renameDashboard: (id: string, newName: string) => Promise<void>;
  duplicateDashboard: (id: string) => Promise<void>;
  deleteDashboard: (id: string) => Promise<void>;
}

const WorkbookContext = createContext<WorkbookContextType | null>(null);

export function useWorkbookWorkspace() {
  const context = useContext(WorkbookContext);
  if (!context) {
    throw new Error("useWorkbookWorkspace must be used within a WorkbookProvider");
  }
  return context;
}

export function WorkbookProvider({
  workbookId,
  children,
}: {
  workbookId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [workbook, setWorkbook] = useState<WorkbookPublic | null>(null);
  const [queries, setQueries] = useState<QueryPublic[]>([]);
  const [charts, setCharts] = useState<ChartPublic[]>([]);
  const [dashboards, setDashboards] = useState<DashboardPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [wbRes, qRes, cRes, dRes] = await Promise.all([
        fetch(`/api/workbooks/${workbookId}`),
        fetch(`/api/queries?workbookId=${workbookId}`),
        fetch(`/api/charts?workbookId=${workbookId}`),
        fetch(`/api/dashboards?workbookId=${workbookId}`),
      ]);

      const [wbJson, qJson, cJson, dJson] = await Promise.all([
        wbRes.json() as Promise<{ data?: WorkbookPublic; error?: string }>,
        qRes.json() as Promise<{ data?: QueryPublic[]; error?: string }>,
        cRes.json() as Promise<{ data?: ChartPublic[]; error?: string }>,
        dRes.json() as Promise<{ data?: DashboardPublic[]; error?: string }>,
      ]);

      if (!wbRes.ok || !wbJson.data) {
        throw new Error(wbJson.error || "Workbook not found");
      }

      setWorkbook(wbJson.data);
      if (qJson.data) setQueries(qJson.data);
      if (cJson.data) setCharts(cJson.data);
      if (dJson.data) setDashboards(dJson.data);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load workbook";
      setError(msg);
      toast.error("Error loading workbook", { description: msg });
    } finally {
      setLoading(false);
    }
  }, [workbookId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAll();
  }, [fetchAll]);

  // ---------------------------------------------------------------------------
  // Workbook actions
  // ---------------------------------------------------------------------------

  const renameWorkbook = async (newName: string) => {
    if (!newName.trim() || !workbook) return;
    try {
      const res = await fetch(`/api/workbooks/${workbookId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: workbook.description }),
      });
      const json = (await res.json()) as { data?: WorkbookPublic; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Failed to rename workbook");
      setWorkbook(json.data);
      toast.success("Workbook renamed");
    } catch (err) {
      toast.error("Failed to rename workbook", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const duplicateWorkbook = async () => {
    if (!workbook) return;
    try {
      const res = await fetch(`/api/workbooks/${workbookId}/duplicate`, {
        method: "POST",
      });
      const json = (await res.json()) as { data?: WorkbookPublic; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Failed to duplicate");
      toast.success("Workbook duplicated");
      router.push(`/workbooks/${json.data.id}`);
    } catch (err) {
      toast.error("Failed to duplicate workbook", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const deleteWorkbook = async () => {
    try {
      const res = await fetch(`/api/workbooks/${workbookId}`, { method: "DELETE" });
      const json = (await res.json()) as { data?: { ok: boolean }; error?: string };
      if (!res.ok) throw new Error(json.error || "Delete failed");
      toast.success("Workbook deleted");
      router.push("/workbooks");
    } catch (err) {
      toast.error("Failed to delete workbook", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Query actions
  // ---------------------------------------------------------------------------

  const addQuery = async (): Promise<string | undefined> => {
    try {
      const dsRes = await fetch("/api/data-sources");
      const dsJson = (await dsRes.json()) as { data?: { id: string }[] };
      const firstDs = dsJson.data?.[0];
      if (!firstDs) {
        toast.error("No data sources found", {
          description: "Connect a data source first before creating a query.",
        });
        return;
      }

      const res = await fetch("/api/queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workbookId,
          name: "Untitled query",
          dataSourceId: firstDs.id,
          mode: "sql",
          sql: "SELECT 1;",
          definition: { source: { table: "" }, steps: [] },
        }),
      });
      const json = (await res.json()) as { data?: QueryPublic; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Failed to create query");

      setQueries((prev) => [...prev, json.data!]);
      toast.success("Query created");
      router.push(`/workbooks/${workbookId}/query/${json.data.id}`);
      return json.data.id;
    } catch (err) {
      toast.error("Failed to create query", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const renameQuery = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      const res = await fetch(`/api/queries/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const json = (await res.json()) as { data?: QueryPublic; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Failed to rename query");

      setQueries((prev) => prev.map((q) => (q.id === id ? json.data! : q)));
      toast.success("Query renamed");
    } catch (err) {
      toast.error("Failed to rename query", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const duplicateQuery = async (id: string) => {
    const q = queries.find((item) => item.id === id);
    if (!q) return;
    try {
      const res = await fetch("/api/queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workbookId,
          name: `${q.name} (Copy)`,
          dataSourceId: q.dataSourceId,
          mode: q.mode,
          definition: q.definition,
          sql: q.sql,
        }),
      });
      const json = (await res.json()) as { data?: QueryPublic; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Failed to duplicate");

      setQueries((prev) => [...prev, json.data!]);
      toast.success("Query duplicated");
      router.push(`/workbooks/${workbookId}/query/${json.data.id}`);
    } catch (err) {
      toast.error("Failed to duplicate query", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const deleteQuery = async (id: string) => {
    try {
      const res = await fetch(`/api/queries/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");

      setQueries((prev) => prev.filter((q) => q.id !== id));
      toast.success("Query deleted");
      router.push(`/workbooks/${workbookId}`);
    } catch (err) {
      toast.error("Failed to delete query", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Chart actions
  // ---------------------------------------------------------------------------

  const addChart = async (): Promise<string | undefined> => {
    try {
      let targetQueryId: string | undefined = queries[0]?.id;
      if (!targetQueryId) {
        // Create an initial query first
        targetQueryId = await addQuery();
        if (!targetQueryId) return;
      }

      const res = await fetch("/api/charts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queryId: targetQueryId,
          name: "Untitled chart",
          type: "bar",
          config: defaultChartConfig,
        }),
      });
      const json = (await res.json()) as { data?: ChartPublic; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Failed to create chart");

      setCharts((prev) => [...prev, json.data!]);
      toast.success("Chart created");
      router.push(`/workbooks/${workbookId}/chart/${json.data.id}`);
      return json.data.id;
    } catch (err) {
      toast.error("Failed to create chart", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const renameChart = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      const res = await fetch(`/api/charts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const json = (await res.json()) as { data?: ChartPublic; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Failed to rename chart");

      setCharts((prev) => prev.map((c) => (c.id === id ? json.data! : c)));
      toast.success("Chart renamed");
    } catch (err) {
      toast.error("Failed to rename chart", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const duplicateChart = async (id: string) => {
    const c = charts.find((item) => item.id === id);
    if (!c) return;
    try {
      const res = await fetch("/api/charts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queryId: c.queryId,
          name: `${c.name} (Copy)`,
          type: c.type,
          config: c.config,
        }),
      });
      const json = (await res.json()) as { data?: ChartPublic; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Failed to duplicate");

      setCharts((prev) => [...prev, json.data!]);
      toast.success("Chart duplicated");
      router.push(`/workbooks/${workbookId}/chart/${json.data.id}`);
    } catch (err) {
      toast.error("Failed to duplicate chart", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const deleteChart = async (id: string) => {
    try {
      const res = await fetch(`/api/charts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");

      setCharts((prev) => prev.filter((c) => c.id !== id));
      toast.success("Chart deleted");
      router.push(`/workbooks/${workbookId}`);
    } catch (err) {
      toast.error("Failed to delete chart", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Dashboard actions
  // ---------------------------------------------------------------------------

  const addDashboard = async (): Promise<string | undefined> => {
    try {
      const res = await fetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workbookId,
          name: "Untitled dashboard",
          layout: [],
          filters: [],
        }),
      });
      const json = (await res.json()) as { data?: DashboardPublic; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Failed to create dashboard");

      setDashboards((prev) => [...prev, json.data!]);
      toast.success("Dashboard created");
      router.push(`/workbooks/${workbookId}/dashboard/${json.data.id}`);
      return json.data.id;
    } catch (err) {
      toast.error("Failed to create dashboard", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const renameDashboard = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      const res = await fetch(`/api/dashboards/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const json = (await res.json()) as { data?: DashboardPublic; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Failed to rename dashboard");

      setDashboards((prev) => prev.map((d) => (d.id === id ? json.data! : d)));
      toast.success("Dashboard renamed");
    } catch (err) {
      toast.error("Failed to rename dashboard", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const duplicateDashboard = async (id: string) => {
    const d = dashboards.find((item) => item.id === id);
    if (!d) return;
    try {
      const res = await fetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workbookId,
          name: `${d.name} (Copy)`,
          layout: d.layout,
          filters: d.filters,
        }),
      });
      const json = (await res.json()) as { data?: DashboardPublic; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Failed to duplicate");

      setDashboards((prev) => [...prev, json.data!]);
      toast.success("Dashboard duplicated");
      router.push(`/workbooks/${workbookId}/dashboard/${json.data.id}`);
    } catch (err) {
      toast.error("Failed to duplicate dashboard", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const deleteDashboard = async (id: string) => {
    try {
      const res = await fetch(`/api/dashboards/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");

      setDashboards((prev) => prev.filter((d) => d.id !== id));
      toast.success("Dashboard deleted");
      router.push(`/workbooks/${workbookId}`);
    } catch (err) {
      toast.error("Failed to delete dashboard", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <WorkbookContext.Provider
      value={{
        workbookId,
        workbook,
        queries,
        charts,
        dashboards,
        loading,
        error,
        refreshWorkbook: fetchAll,
        renameWorkbook,
        duplicateWorkbook,
        deleteWorkbook,
        addQuery,
        renameQuery,
        duplicateQuery,
        deleteQuery,
        addChart,
        renameChart,
        duplicateChart,
        deleteChart,
        addDashboard,
        renameDashboard,
        duplicateDashboard,
        deleteDashboard,
      }}
    >
      {children}
    </WorkbookContext.Provider>
  );
}
