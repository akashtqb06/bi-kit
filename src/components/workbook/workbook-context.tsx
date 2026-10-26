"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import type { WorkbookPublic } from "@src/lib/workbooks/service";
import type { FolderPublic } from "@src/lib/folders/service";
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
  folders: FolderPublic[];
  loading: boolean;
  error: string | null;
  refreshWorkbook: () => Promise<void>;
  // Workbook actions
  renameWorkbook: (newName: string) => Promise<void>;
  duplicateWorkbook: () => Promise<void>;
  deleteWorkbook: () => Promise<void>;
  // Folder actions
  addFolder: (kind: "query" | "chart" | "dashboard", name?: string) => Promise<FolderPublic | undefined>;
  renameFolder: (id: string, newName: string) => Promise<boolean>;
  deleteFolder: (id: string, mode?: "keep" | "delete") => Promise<boolean>;
  moveItem: (type: "query" | "chart" | "dashboard", id: string, folderId: string | null) => Promise<boolean>;
  // Expanded folders state
  expandedFolderIds: Set<string>;
  toggleFolder: (id: string) => void;
  expandFolder: (id: string) => void;
  collapseFolder: (id: string) => void;
  // Query actions
  addQuery: (folderId?: string | null) => Promise<string | undefined>;
  renameQuery: (id: string, newName: string) => Promise<void>;
  duplicateQuery: (id: string) => Promise<void>;
  deleteQuery: (id: string) => Promise<void>;
  // Chart actions
  addChart: (folderId?: string | null) => Promise<string | undefined>;
  renameChart: (id: string, newName: string) => Promise<void>;
  duplicateChart: (id: string) => Promise<void>;
  deleteChart: (id: string) => Promise<void>;
  // Dashboard actions
  addDashboard: (folderId?: string | null) => Promise<string | undefined>;
  renameDashboard: (id: string, newName: string) => Promise<void>;
  duplicateDashboard: (id: string) => Promise<void>;
  deleteDashboard: (id: string) => Promise<void>;
}

export function getNextName(baseName: string, existingNames: string[]): string {
  const set = new Set(existingNames.map((n) => n.toLowerCase().trim()));
  if (!set.has(baseName.toLowerCase().trim())) {
    return baseName;
  }
  let index = 2;
  while (set.has(`${baseName} ${index}`.toLowerCase())) {
    index++;
  }
  return `${baseName} ${index}`;
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
  const pathname = usePathname();
  const [workbook, setWorkbook] = useState<WorkbookPublic | null>(null);
  const [queries, setQueries] = useState<QueryPublic[]>([]);
  const [charts, setCharts] = useState<ChartPublic[]>([]);
  const [dashboards, setDashboards] = useState<DashboardPublic[]>([]);
  const [folders, setFolders] = useState<FolderPublic[]>([]);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize expanded folders from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`bi-kit:expanded-folders:${workbookId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setExpandedFolderIds(new Set(parsed));
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [workbookId]);

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
      if (wbJson.data.folders) {
        setFolders(wbJson.data.folders);
      }
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

  // Auto-expand folder containing the active item
  useEffect(() => {
    if (!pathname) return;
    let activeFolderId: string | null = null;
    for (const q of queries) {
      if (pathname.includes(`/query/${q.id}`) && q.folderId) {
        activeFolderId = q.folderId;
        break;
      }
    }
    if (!activeFolderId) {
      for (const c of charts) {
        if (pathname.includes(`/chart/${c.id}`) && c.folderId) {
          activeFolderId = c.folderId;
          break;
        }
      }
    }
    if (!activeFolderId) {
      for (const d of dashboards) {
        if (pathname.includes(`/dashboard/${d.id}`) && d.folderId) {
          activeFolderId = d.folderId;
          break;
        }
      }
    }
    if (activeFolderId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpandedFolderIds((prev) => {
        if (prev.has(activeFolderId!)) return prev;
        const next = new Set(prev);
        next.add(activeFolderId!);
        try {
          localStorage.setItem(`bi-kit:expanded-folders:${workbookId}`, JSON.stringify(Array.from(next)));
        } catch {
          // ignore
        }
        return next;
      });
    }
  }, [pathname, queries, charts, dashboards, workbookId]);

  // ---------------------------------------------------------------------------
  // Folder actions & expand / collapse
  // ---------------------------------------------------------------------------

  const toggleFolder = useCallback((id: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      try {
        localStorage.setItem(`bi-kit:expanded-folders:${workbookId}`, JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
  }, [workbookId]);

  const expandFolder = useCallback((id: string) => {
    setExpandedFolderIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(`bi-kit:expanded-folders:${workbookId}`, JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
  }, [workbookId]);

  const collapseFolder = useCallback((id: string) => {
    setExpandedFolderIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      try {
        localStorage.setItem(`bi-kit:expanded-folders:${workbookId}`, JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
  }, [workbookId]);

  const addFolder = async (kind: "query" | "chart" | "dashboard", name?: string): Promise<FolderPublic | undefined> => {
    const existingFolders = folders.filter((f) => f.kind === kind);
    const folderName = name?.trim() || getNextName("New folder", existingFolders.map((f) => f.name));

    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workbookId,
          kind,
          name: folderName,
          position: 0,
        }),
      });
      const json = (await res.json()) as { data?: FolderPublic; error?: string };
      if (!res.ok || !json.data) {
        throw new Error(json.error || "Failed to create folder");
      }

      setFolders((prev) => [json.data!, ...prev.filter((f) => f.id !== json.data!.id)]);
      expandFolder(json.data.id);
      toast.success("Folder created");
      return json.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create folder";
      toast.error("Failed to create folder", { description: msg });
      throw err;
    }
  };

  const renameFolder = async (id: string, newName: string): Promise<boolean> => {
    const trimmed = newName.trim();
    if (!trimmed) return false;
    const current = folders.find((f) => f.id === id);
    if (!current || current.name === trimmed) return true;

    const previousName = current.name;
    // Optimistic update
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: trimmed } : f)));

    try {
      const res = await fetch(`/api/folders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = (await res.json()) as { data?: FolderPublic; error?: string };
      if (!res.ok || !json.data) {
        throw new Error(json.error || "Failed to rename folder");
      }
      setFolders((prev) => prev.map((f) => (f.id === id ? json.data! : f)));
      toast.success("Folder renamed");
      return true;
    } catch (err) {
      // Roll back
      setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: previousName } : f)));
      const msg = err instanceof Error ? err.message : "Failed to rename folder";
      toast.error("Failed to rename folder", { description: msg });
      return false;
    }
  };

  const deleteFolderAction = async (id: string, mode: "keep" | "delete" = "keep"): Promise<boolean> => {
    const previousFolders = [...folders];
    const previousQueries = [...queries];
    const previousCharts = [...charts];
    const previousDashboards = [...dashboards];

    // Optimistic update
    setFolders((prev) => prev.filter((f) => f.id !== id));
    if (mode === "delete") {
      setQueries((prev) => prev.filter((q) => q.folderId !== id));
      setCharts((prev) => prev.filter((c) => c.folderId !== id));
      setDashboards((prev) => prev.filter((d) => d.folderId !== id));
    } else {
      setQueries((prev) => prev.map((q) => (q.folderId === id ? { ...q, folderId: null } : q)));
      setCharts((prev) => prev.map((c) => (c.folderId === id ? { ...c, folderId: null } : c)));
      setDashboards((prev) => prev.map((d) => (d.folderId === id ? { ...d, folderId: null } : d)));
    }

    try {
      const res = await fetch(`/api/folders/${id}?mode=${mode}`, { method: "DELETE" });
      const json = (await res.json()) as { data?: { ok: boolean }; error?: string };
      if (!res.ok || !json.data) {
        throw new Error(json.error || "Failed to delete folder");
      }
      toast.success("Folder deleted");
      return true;
    } catch (err) {
      // Roll back
      setFolders(previousFolders);
      setQueries(previousQueries);
      setCharts(previousCharts);
      setDashboards(previousDashboards);
      const msg = err instanceof Error ? err.message : "Failed to delete folder";
      toast.error("Failed to delete folder", { description: msg });
      return false;
    }
  };

  const moveItem = async (
    type: "query" | "chart" | "dashboard",
    id: string,
    targetFolderId: string | null
  ): Promise<boolean> => {
    let prevFolderId: string | null = null;
    if (type === "query") {
      const item = queries.find((q) => q.id === id);
      if (!item) return false;
      prevFolderId = item.folderId ?? null;
      if (prevFolderId === targetFolderId) return true;
      setQueries((prev) => prev.map((q) => (q.id === id ? { ...q, folderId: targetFolderId } : q)));
    } else if (type === "chart") {
      const item = charts.find((c) => c.id === id);
      if (!item) return false;
      prevFolderId = item.folderId ?? null;
      if (prevFolderId === targetFolderId) return true;
      setCharts((prev) => prev.map((c) => (c.id === id ? { ...c, folderId: targetFolderId } : c)));
    } else if (type === "dashboard") {
      const item = dashboards.find((d) => d.id === id);
      if (!item) return false;
      prevFolderId = item.folderId ?? null;
      if (prevFolderId === targetFolderId) return true;
      setDashboards((prev) => prev.map((d) => (d.id === id ? { ...d, folderId: targetFolderId } : d)));
    }

    if (targetFolderId) {
      expandFolder(targetFolderId);
    }

    const endpoint = type === "query" ? `/api/queries/${id}` : type === "chart" ? `/api/charts/${id}` : `/api/dashboards/${id}`;

    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: targetFolderId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || `Failed to move ${type}`);
      }
      return true;
    } catch (err) {
      // Roll back
      if (type === "query") {
        setQueries((prev) => prev.map((q) => (q.id === id ? { ...q, folderId: prevFolderId } : q)));
      } else if (type === "chart") {
        setCharts((prev) => prev.map((c) => (c.id === id ? { ...c, folderId: prevFolderId } : c)));
      } else if (type === "dashboard") {
        setDashboards((prev) => prev.map((d) => (d.id === id ? { ...d, folderId: prevFolderId } : d)));
      }
      const msg = err instanceof Error ? err.message : `Failed to move ${type}`;
      toast.error(`Failed to move ${type}`, { description: msg });
      return false;
    }
  };

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

  const addQuery = async (folderId?: string | null): Promise<string | undefined> => {
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

      const queryName = getNextName("Untitled query", queries.map((q) => q.name));

      const res = await fetch("/api/queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workbookId,
          name: queryName,
          dataSourceId: firstDs.id,
          mode: "sql",
          sql: "SELECT 1;",
          definition: "[]",
          folderId: folderId ?? null,
        }),
      });
      const json = (await res.json()) as { data?: QueryPublic; error?: string };
      if (!res.ok || !json.data) {
        throw new Error(json.error || "Failed to create query");
      }

      setQueries((prev) => [...prev, json.data!]);
      if (folderId) {
        expandFolder(folderId);
      }
      router.refresh();
      toast.success("Query created");
      router.push(`/workbooks/${workbookId}/query/${json.data.id}`);
      return json.data.id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create query";
      toast.error("Failed to create query", {
        description: msg,
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
          folderId: q.folderId ?? null,
        }),
      });
      const json = (await res.json()) as { data?: QueryPublic; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Failed to duplicate");

      setQueries((prev) => [...prev, json.data!]);
      if (q.folderId) {
        expandFolder(q.folderId);
      }
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

  const addChart = async (folderId?: string | null): Promise<string | undefined> => {
    try {
      let targetQueryId: string | undefined = queries[0]?.id;
      if (!targetQueryId) {
        // Create an initial query first
        targetQueryId = await addQuery();
        if (!targetQueryId) return;
      }

      const chartName = getNextName("Untitled chart", charts.map((c) => c.name));
      const res = await fetch("/api/charts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queryId: targetQueryId,
          name: chartName,
          type: "bar",
          config: defaultChartConfig,
          folderId: folderId ?? null,
        }),
      });
      const json = (await res.json()) as { data?: ChartPublic; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Failed to create chart");

      setCharts((prev) => [...prev, json.data!]);
      if (folderId) {
        expandFolder(folderId);
      }
      router.refresh();
      toast.success("Chart created");
      router.push(`/workbooks/${workbookId}/chart/${json.data.id}`);
      return json.data.id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create chart";
      toast.error("Failed to create chart", {
        description: msg,
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
          folderId: c.folderId ?? null,
        }),
      });
      const json = (await res.json()) as { data?: ChartPublic; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Failed to duplicate");

      setCharts((prev) => [...prev, json.data!]);
      if (c.folderId) {
        expandFolder(c.folderId);
      }
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

  const addDashboard = async (folderId?: string | null): Promise<string | undefined> => {
    try {
      const dashboardName = getNextName("Untitled dashboard", dashboards.map((d) => d.name));
      const res = await fetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workbookId,
          name: dashboardName,
          layout: [],
          filters: [],
          folderId: folderId ?? null,
        }),
      });
      const json = (await res.json()) as { data?: DashboardPublic; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Failed to create dashboard");

      setDashboards((prev) => [...prev, json.data!]);
      if (folderId) {
        expandFolder(folderId);
      }
      router.refresh();
      toast.success("Dashboard created");
      router.push(`/workbooks/${workbookId}/dashboard/${json.data.id}?edit=true`);
      return json.data.id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create dashboard";
      toast.error("Failed to create dashboard", {
        description: msg,
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
          folderId: d.folderId ?? null,
        }),
      });
      const json = (await res.json()) as { data?: DashboardPublic; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Failed to duplicate");

      setDashboards((prev) => [...prev, json.data!]);
      if (d.folderId) {
        expandFolder(d.folderId);
      }
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
        folders,
        loading,
        error,
        refreshWorkbook: fetchAll,
        renameWorkbook,
        duplicateWorkbook,
        deleteWorkbook,
        addFolder,
        renameFolder,
        deleteFolder: deleteFolderAction,
        moveItem,
        expandedFolderIds,
        toggleFolder,
        expandFolder,
        collapseFolder,
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
