import type { SchemaInfo, ColumnInfo } from "@src/lib/connectors/types";
import type { QueryStep } from "./definition";

/**
 * Infer the available columns before a given step index.
 * Step 0 has the source table's columns available.
 */
export function getAvailableColumnsForStep(
  definition: { source: { table: string }; steps: QueryStep[] },
  stepIndex: number,
  schema: SchemaInfo | null | undefined
): ColumnInfo[] {
  if (!schema || !definition.source.table) {
    return [];
  }

  const sourceTable = schema.tables.find(
    (t) => t.name.toLowerCase() === definition.source.table.toLowerCase()
  );
  if (!sourceTable) {
    return [];
  }

  let currentCols: ColumnInfo[] = [...sourceTable.columns];

  const limitIndex = Math.min(stepIndex, definition.steps.length);
  for (let i = 0; i < limitIndex; i++) {
    const step = definition.steps[i];
    currentCols = applyStepToColumns(currentCols, step, schema);
  }

  return currentCols;
}

/**
 * Infer the final output columns of a query definition.
 */
export function inferOutputColumns(
  definition: { source: { table: string }; steps: QueryStep[] },
  schema: SchemaInfo | null | undefined
): ColumnInfo[] {
  return getAvailableColumnsForStep(definition, definition.steps.length, schema);
}

function applyStepToColumns(
  prevCols: ColumnInfo[],
  step: QueryStep,
  schema: SchemaInfo
): ColumnInfo[] {
  switch (step.type) {
    case "join": {
      const joinTable = schema.tables.find(
        (t) => t.name.toLowerCase() === step.table.toLowerCase()
      );
      if (!joinTable) return prevCols;

      const existingNames = new Set(prevCols.map((c) => c.name.toLowerCase()));
      const addedCols: ColumnInfo[] = joinTable.columns
        .filter((c) => !existingNames.has(c.name.toLowerCase()))
        .map((c) => ({
          ...c,
          nullable: step.joinType === "left" ? true : c.nullable,
        }));

      return [...prevCols, ...addedCols];
    }

    case "mutate": {
      if (!step.name) return prevCols;
      const existingIdx = prevCols.findIndex(
        (c) => c.name.toLowerCase() === step.name.toLowerCase()
      );
      const newCol: ColumnInfo = {
        name: step.name,
        type: "EXPRESSION",
        nullable: true,
      };
      if (existingIdx >= 0) {
        const next = [...prevCols];
        next[existingIdx] = newCol;
        return next;
      }
      return [...prevCols, newCol];
    }

    case "summarize": {
      const nextCols: ColumnInfo[] = [];

      for (const gb of step.groupBy) {
        const prev = prevCols.find((c) => c.name === gb.column);
        nextCols.push({
          name: gb.column,
          type: gb.dateGrain ? "TEXT" : prev?.type || "TEXT",
          nullable: prev?.nullable ?? true,
        });
      }

      for (const agg of step.aggregates) {
        const prev = prevCols.find((c) => c.name === agg.column);
        const isCount = agg.fn === "count" || agg.fn === "count_distinct";
        nextCols.push({
          name: agg.alias,
          type: isCount ? "INTEGER" : prev?.type || "REAL",
          nullable: isCount ? false : true,
        });
      }

      return nextCols;
    }

    case "select": {
      const nextCols: ColumnInfo[] = [];
      for (const colName of step.columns) {
        const prev = prevCols.find((c) => c.name === colName);
        if (prev) {
          nextCols.push(prev);
        } else {
          nextCols.push({ name: colName, type: "TEXT", nullable: true });
        }
      }
      return nextCols;
    }

    case "filter":
    case "order":
    case "limit":
    default:
      return prevCols;
  }
}
