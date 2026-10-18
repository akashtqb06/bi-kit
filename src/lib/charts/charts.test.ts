import { describe, it, expect } from "vitest";
import {
  normalizeData,
  computeNumberCardValue,
  COLOR_PALETTES,
} from "@src/components/charts/chart-renderer";
import {
  chartConfigSchema,
  defaultChartConfig,
  type ChartConfigData,
} from "@src/lib/schemas";
import { aggregateChartData } from "./aggregate";

describe("Chart Data & Configuration", () => {
  describe("normalizeData", () => {
    it("handles null and undefined data", () => {
      expect(normalizeData(null)).toEqual({ columnNames: [], rows: [] });
      expect(normalizeData(undefined)).toEqual({ columnNames: [], rows: [] });
    });

    it("normalizes array of row objects", () => {
      const data = [
        { month: "Jan", sales: 100 },
        { month: "Feb", sales: 150 },
      ];
      const normalized = normalizeData(data);
      expect(normalized.columnNames).toEqual(["month", "sales"]);
      expect(normalized.rows).toHaveLength(2);
      expect(normalized.rows[0]).toEqual({ month: "Jan", sales: 100 });
    });

    it("normalizes { columns, rows } from query results", () => {
      const data = {
        columns: [
          { name: "category", type: "text" },
          { name: "total", type: "integer" },
        ],
        rows: [
          ["Electronics", 5000],
          ["Clothing", 3200],
        ],
      };
      const normalized = normalizeData(data);
      expect(normalized.columnNames).toEqual(["category", "total"]);
      expect(normalized.rows).toEqual([
        { category: "Electronics", total: 5000 },
        { category: "Clothing", total: 3200 },
      ]);
    });

    it("safely converts BigInt values to numbers", () => {
      const data = {
        columns: [{ name: "id", type: "integer" }, { name: "big_val", type: "integer" }],
        rows: [[1, BigInt(999999)]],
      };
      const normalized = normalizeData(data);
      expect(normalized.rows[0].big_val).toBe(999999);
      expect(typeof normalized.rows[0].big_val).toBe("number");
    });
  });

  describe("computeNumberCardValue", () => {
    const rows = [
      { id: 1, revenue: 1000, category: "A" },
      { id: 2, revenue: 2000, category: "B" },
      { id: 3, revenue: 3000, category: "C" },
    ];
    const colNames = ["id", "revenue", "category"];

    it("computes first value", () => {
      const config: ChartConfigData = {
        ...defaultChartConfig,
        numberValueColumn: "revenue",
        numberAggregation: "first",
        numberFormat: "none",
      };
      const res = computeNumberCardValue(rows, config, colNames);
      expect(res.value).toBe(1000);
      expect(res.formatted).toBe("1,000");
    });

    it("computes sum aggregation", () => {
      const config: ChartConfigData = {
        ...defaultChartConfig,
        numberValueColumn: "revenue",
        numberAggregation: "sum",
        numberFormat: "none",
      };
      const res = computeNumberCardValue(rows, config, colNames);
      expect(res.value).toBe(6000);
      expect(res.formatted).toBe("6,000");
    });

    it("computes avg aggregation", () => {
      const config: ChartConfigData = {
        ...defaultChartConfig,
        numberValueColumn: "revenue",
        numberAggregation: "avg",
        numberFormat: "none",
      };
      const res = computeNumberCardValue(rows, config, colNames);
      expect(res.value).toBe(2000);
      expect(res.formatted).toBe("2,000");
    });

    it("computes count aggregation", () => {
      const config: ChartConfigData = {
        ...defaultChartConfig,
        numberValueColumn: "revenue",
        numberAggregation: "count",
        numberFormat: "none",
      };
      const res = computeNumberCardValue(rows, config, colNames);
      expect(res.value).toBe(3);
      expect(res.formatted).toBe("3");
    });

    it("computes min and max aggregations", () => {
      const minConfig: ChartConfigData = {
        ...defaultChartConfig,
        numberValueColumn: "revenue",
        numberAggregation: "min",
        numberFormat: "none",
      };
      expect(computeNumberCardValue(rows, minConfig, colNames).value).toBe(1000);

      const maxConfig: ChartConfigData = {
        ...defaultChartConfig,
        numberValueColumn: "revenue",
        numberAggregation: "max",
        numberFormat: "none",
      };
      expect(computeNumberCardValue(rows, maxConfig, colNames).value).toBe(3000);
    });

    it("formats currency with prefix and suffix", () => {
      const config: ChartConfigData = {
        ...defaultChartConfig,
        numberValueColumn: "revenue",
        numberAggregation: "sum",
        numberFormat: "currency",
        numberPrefix: "Total: ",
        numberSuffix: " USD",
      };
      const res = computeNumberCardValue(rows, config, colNames);
      expect(res.formatted).toBe("Total: $6,000.00 USD");
    });

    it("formats compact notation", () => {
      const bigRows = [{ val: 1500000 }];
      const config: ChartConfigData = {
        ...defaultChartConfig,
        numberValueColumn: "val",
        numberAggregation: "first",
        numberFormat: "compact",
      };
      const res = computeNumberCardValue(bigRows, config, ["val"]);
      expect(res.formatted).toBe("1.5M");
    });
  });

  describe("chartConfigSchema", () => {
    it("parses empty object to default values", () => {
      const parsed = chartConfigSchema.parse({});
      expect(parsed.stacked).toBe(false);
      expect(parsed.showLegend).toBe(true);
      expect(parsed.showGrid).toBe(true);
      expect(parsed.colorPalette).toBe("default");
      expect(parsed.numberAggregation).toBe("first");
      expect(parsed.sortX).toBe("none");
    });

    it("preserves explicit configuration values", () => {
      const parsed = chartConfigSchema.parse({
        title: "Q3 Sales",
        xAxis: "month",
        yAxis: ["sales", "profit"],
        series: "region",
        stacked: true,
        colorPalette: "ocean",
        showLegend: false,
      });
      expect(parsed.title).toBe("Q3 Sales");
      expect(parsed.xAxis).toBe("month");
      expect(parsed.yAxis).toEqual(["sales", "profit"]);
      expect(parsed.series).toBe("region");
      expect(parsed.stacked).toBe(true);
      expect(parsed.colorPalette).toBe("ocean");
      expect(parsed.showLegend).toBe(false);
    });
  });

  describe("color palettes", () => {
    it("provides all standard palettes with valid colors", () => {
      const palettes = ["default", "ocean", "emerald", "sunset", "monochrome", "rainbow"];
      for (const p of palettes) {
        expect(COLOR_PALETTES[p]).toBeDefined();
        expect(COLOR_PALETTES[p].length).toBeGreaterThanOrEqual(4);
        for (const color of COLOR_PALETTES[p]) {
          expect(color).toMatch(/^(#[0-9a-fA-F]{6}|var\(--[\w-]+\))$/);
        }
      }
    });
  });

  describe("aggregateChartData", () => {
    const ordersData = [
      { created_at: "2016-09-02T10:00:00Z", total: 100, items: 2 },
      { created_at: "2016-09-18T14:30:00Z", total: 250, items: 5 },
      { created_at: "2016-10-05T09:15:00Z", total: 400, items: 4 },
      { created_at: "2016-10-22T16:00:00Z", total: 150, items: 1 },
    ];
    const colNames = ["created_at", "total", "items"];

    it("aggregates data by date grain month with formatted label 'September, 2016'", () => {
      const config: ChartConfigData = {
        ...defaultChartConfig,
        xAxis: "created_at",
        xDateGrain: "month",
        seriesConfig: [
          { column: "total", aggregation: "sum", label: "Total Revenue" },
        ],
      };
      const res = aggregateChartData(ordersData, config, colNames);
      expect(res.rows).toHaveLength(2);
      expect(res.rows[0]["created_at"]).toBe("September, 2016");
      expect(res.rows[0]["total"]).toBe(350);
      expect(res.rows[1]["created_at"]).toBe("October, 2016");
      expect(res.rows[1]["total"]).toBe(550);
    });

    it("aggregates multiple series with different aggregation functions", () => {
      const config: ChartConfigData = {
        ...defaultChartConfig,
        xAxis: "created_at",
        xDateGrain: "month",
        seriesConfig: [
          { column: "total", aggregation: "sum", label: "Revenue" },
          { column: "items", aggregation: "avg", label: "Avg Items" },
        ],
      };
      const res = aggregateChartData(ordersData, config, colNames);
      expect(res.rows).toHaveLength(2);
      expect(res.rows[0]["total"]).toBe(350);
      expect(res.rows[0]["items"]).toBe(3.5);
      expect(res.seriesKeys).toEqual(["total", "items"]);
    });

    it("supports normalize (100% stacked)", () => {
      const config: ChartConfigData = {
        ...defaultChartConfig,
        xAxis: "created_at",
        xDateGrain: "month",
        normalize: true,
        seriesConfig: [
          { column: "total", aggregation: "sum" },
          { column: "items", aggregation: "sum" },
        ],
      };
      const res = aggregateChartData(ordersData, config, colNames);
      const totalPct = Number(res.rows[0]["total"]);
      const itemsPct = Number(res.rows[0]["items"]);
      expect(Math.round(totalPct + itemsPct)).toBe(100);
    });
  });
});

