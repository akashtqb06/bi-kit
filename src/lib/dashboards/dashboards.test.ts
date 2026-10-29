import { describe, it, expect } from "vitest";
import {
  layoutItemSchema,
  dashboardFilterSchema,
  createDashboardSchema,
  updateDashboardSchema,
  type DashboardFilter,
} from "@src/lib/schemas";
import {
  parseDashboardLayout,
  serializeDashboardLayout,
  parseDashboardFilters,
  serializeDashboardFilters,
} from "@src/lib/db/json-helpers";
import {
  createDashboard,
  getDashboardPublic,
  listDashboards,
  updateDashboard,
  deleteDashboard,
  recordDashboardView,
} from "./service";
import { createWorkbook } from "@src/lib/workbooks/service";

describe("Dashboard Schemas & Layout Helpers", () => {
  it("validates correct layout items", () => {
    const item = {
      i: "tile_1",
      chartId: "chart_123",
      x: 0,
      y: 0,
      w: 6,
      h: 4,
    };
    const parsed = layoutItemSchema.parse(item);
    expect(parsed).toEqual(item);
  });

  it("rejects negative coordinates or zero dimensions", () => {
    expect(() =>
      layoutItemSchema.parse({
        i: "tile_1",
        chartId: "chart_123",
        x: -1,
        y: 0,
        w: 6,
        h: 4,
      })
    ).toThrow();

    expect(() =>
      layoutItemSchema.parse({
        i: "tile_1",
        chartId: "chart_123",
        x: 0,
        y: 0,
        w: 0,
        h: 4,
      })
    ).toThrow();
  });

  it("parses and serializes dashboard layout JSON", () => {
    const layout = [
      { i: "tile_a", chartId: "chart_1", x: 0, y: 0, w: 6, h: 4 },
      { i: "tile_b", chartId: "chart_2", x: 6, y: 0, w: 6, h: 4 },
    ];
    const serialized = serializeDashboardLayout(layout);
    expect(typeof serialized).toBe("string");

    const parsed = parseDashboardLayout(serialized);
    expect(parsed).toEqual(layout);
  });

  it("validates create and update dashboard inputs", () => {
    const createInput = createDashboardSchema.parse({
      name: "Executive Overview",
      layout: [{ i: "tile_1", chartId: "c_1", x: 0, y: 0, w: 12, h: 5 }],
    });
    expect(createInput.name).toBe("Executive Overview");
    expect(createInput.layout).toHaveLength(1);
    expect(createInput.filters).toEqual([]);

    const updateInput = updateDashboardSchema.parse({
      name: "Updated Executive Overview",
    });
    expect(updateInput.name).toBe("Updated Executive Overview");
  });
});

describe("Dashboard Filter Schemas & Helpers", () => {
  it("validates date_range and select filter definitions", () => {
    const dateFilter = {
      id: "f_date",
      name: "Order Date",
      column: "created_at",
      type: "date_range",
    };
    expect(dashboardFilterSchema.parse(dateFilter)).toEqual(dateFilter);

    const selectFilter = {
      id: "f_status",
      name: "Status",
      column: "status",
      type: "select",
      defaultValue: "completed",
    };
    expect(dashboardFilterSchema.parse(selectFilter)).toEqual(selectFilter);
  });

  it("rejects invalid filter types or missing required fields", () => {
    expect(() =>
      dashboardFilterSchema.parse({
        id: "f_invalid",
        name: "Invalid",
        column: "col",
        type: "checkbox_multi",
      })
    ).toThrow();

    expect(() =>
      dashboardFilterSchema.parse({
        id: "f_missing_col",
        name: "No Col",
        type: "select",
      })
    ).toThrow();
  });

  it("parses and serializes dashboard filters JSON safely", () => {
    const filters: DashboardFilter[] = [
      {
        id: "f_1",
        name: "Order Date Range",
        column: "order_date",
        type: "date_range",
      },
      {
        id: "f_2",
        name: "Category",
        column: "category",
        type: "select",
      },
    ];

    const serialized = serializeDashboardFilters(filters);
    expect(typeof serialized).toBe("string");

    const parsed = parseDashboardFilters(serialized);
    expect(parsed).toEqual(filters);

    // Empty or malformed input returns empty array
    expect(parseDashboardFilters("")).toEqual([]);
    expect(parseDashboardFilters(null)).toEqual([]);
    expect(parseDashboardFilters("not-json")).toEqual([]);
  });
});

describe("Dashboard Service Operations", () => {
  it("creates, retrieves, updates, and deletes dashboards with layouts and filters", async () => {
    // Create a parent workbook
    const wb = await createWorkbook({
      name: "Dashboard Test Workbook",
      description: "Testing dashboards",
    });

    // Create a dashboard with layout and filters
    const initialLayout = [
      { i: "tile_1", chartId: "chart_abc", x: 0, y: 0, w: 6, h: 4 },
    ];
    const initialFilters: DashboardFilter[] = [
      {
        id: "f_1",
        name: "Date Filter",
        column: "created_at",
        type: "date_range",
      },
    ];

    const created = await createDashboard(wb.id, {
      name: "Sales KPI Dashboard",
      layout: initialLayout,
      filters: initialFilters,
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe("Sales KPI Dashboard");
    expect(created.workbookId).toBe(wb.id);
    expect(created.layout).toEqual(initialLayout);
    expect(created.filters).toEqual(initialFilters);

    // Retrieve dashboard
    const fetched = await getDashboardPublic(created.id);
    expect(fetched.name).toBe("Sales KPI Dashboard");
    expect(fetched.layout).toEqual(initialLayout);
    expect(fetched.filters).toEqual(initialFilters);

    // List dashboards in workbook
    const list = await listDashboards(wb.id);
    expect(list.some((d) => d.id === created.id)).toBe(true);

    // Update layout, filters, and name
    const updatedLayout = [
      { i: "tile_1", chartId: "chart_abc", x: 0, y: 0, w: 12, h: 6 },
      { i: "tile_2", chartId: "chart_xyz", x: 0, y: 6, w: 6, h: 4 },
    ];
    const updatedFilters: DashboardFilter[] = [
      ...initialFilters,
      {
        id: "f_2",
        name: "Region Filter",
        column: "region",
        type: "select",
      },
    ];

    const updated = await updateDashboard(created.id, {
      name: "Renamed KPI Dashboard",
      layout: updatedLayout,
      filters: updatedFilters,
    });
    expect(updated.name).toBe("Renamed KPI Dashboard");
    expect(updated.layout).toEqual(updatedLayout);
    expect(updated.filters).toEqual(updatedFilters);

    // Delete dashboard
    await deleteDashboard(created.id);
    await expect(getDashboardPublic(created.id)).rejects.toThrow();
  });

  it("lists all dashboards across workbooks with title search and workbook filters", async () => {
    const wb1 = await createWorkbook({ name: "Alpha Finance" });
    const wb2 = await createWorkbook({ name: "Beta Marketing" });

    const d1 = await createDashboard(wb1.id, {
      title: "Quarterly Revenue",
      layout: [{ i: "t1", chartId: "c1", x: 0, y: 0, w: 6, h: 4 }],
    });
    const d2 = await createDashboard(wb2.id, {
      title: "Campaign Performance",
      layout: [],
    });

    try {
      const all = await listDashboards();
      expect(all.some((d) => d.id === d1.id)).toBe(true);
      expect(all.some((d) => d.id === d2.id)).toBe(true);

      const d1Summary = all.find((d) => d.id === d1.id)!;
      expect(d1Summary.title).toBe("Quarterly Revenue");
      expect(d1Summary.workbookTitle).toBe("Alpha Finance");
      expect(d1Summary.chartCount).toBe(1);

      // Search query
      const searchRev = (await listDashboards()).filter((d) =>
        d.title.toLowerCase().includes("revenue")
      );
      expect(searchRev.some((d) => d.id === d1.id)).toBe(true);
      expect(searchRev.some((d) => d.id === d2.id)).toBe(false);

      // Filter by workbook
      const wb1Dashboards = await listDashboards(wb1.id);
      expect(wb1Dashboards.some((d) => d.id === d1.id)).toBe(true);
      expect(wb1Dashboards.some((d) => d.id === d2.id)).toBe(false);
    } finally {
      await deleteDashboard(d1.id);
      await deleteDashboard(d2.id);
    }
  });

  it("duplicates and bulk deletes dashboards", async () => {
    const wb = await createWorkbook({ name: "Duplicate Test Workbook" });
    const d = await createDashboard(wb.id, {
      title: "Original Dashboard",
      layout: [{ i: "t1", chartId: "c1", x: 0, y: 0, w: 6, h: 4 }],
    });

    const duplicated = await createDashboard(wb.id, {
      title: `${d.title} (Copy)`,
      layout: d.layout,
      filters: d.filters,
    });

    expect(duplicated.id).not.toBe(d.id);
    expect(duplicated.title).toBe("Original Dashboard (Copy)");
    expect(duplicated.chartCount).toBe(1);

    // Delete both
    await deleteDashboard(d.id);
    await deleteDashboard(duplicated.id);
    await expect(getDashboardPublic(d.id)).rejects.toThrow();
    await expect(getDashboardPublic(duplicated.id)).rejects.toThrow();
  });

  it("handles isFavorite, viewCount tracking, and recents/favorites filters", async () => {
    const wb = await createWorkbook({ name: "Favorites Workbook" });
    const d1 = await createDashboard(wb.id, { title: "Dashboard Alpha" });
    const d2 = await createDashboard(wb.id, { title: "Dashboard Beta" });

    try {
      expect(d1.isFavorite).toBe(false);
      expect(d1.viewCount).toBe(0);
      expect(d1.lastViewedAt).toBeNull();

      // Toggle favorite on d1
      const favUpdated = await updateDashboard(d1.id, { isFavorite: true });
      expect(favUpdated.isFavorite).toBe(true);

      // Verify favorites filter
      const favoritesList = (await listDashboards()).filter((d) => d.id === d1.id || d.id === d2.id);
      expect(favoritesList.find((d) => d.id === d1.id)?.isFavorite).toBe(true);

      // Record view on d1
      const viewed1 = await recordDashboardView(d1.id);
      expect(viewed1.viewCount).toBe(1);
      expect(viewed1.lastViewedAt).not.toBeNull();

      const viewed2 = await recordDashboardView(d1.id);
      expect(viewed2.viewCount).toBe(2);

      // Verify recents
      const recents = (await listDashboards()).filter((d) => d.id === d1.id);
      expect(recents[0].viewCount).toBe(2);
      expect(recents[0].lastViewedAt).not.toBeNull();
    } finally {
      await deleteDashboard(d1.id);
      await deleteDashboard(d2.id);
    }
  });
});


