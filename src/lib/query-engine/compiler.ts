/**
 * Query Engine Compiler
 * ---------------------
 * Compiles a QueryDefinition (JSON) into a parameterized SQL SELECT query
 * tailored to a specific SqlDialect (SQLite, PostgreSQL, MySQL, MSSQL).
 *
 * Architecture:
 *   Each step appends a CTE so the final query is:
 *     WITH __s0 AS (...source...),
 *          __s1 AS (SELECT ... FROM __s0 WHERE ...),
 *          ...
 *     SELECT * FROM __sN
 *
 * All user-supplied identifiers (table/column names) are dialect-quoted.
 * All filter values are bound as parameters — never interpolated into SQL text.
 */

import type { SchemaInfo, ColumnInfo } from "@src/lib/connectors/types";
import { sqliteDialect, type SqlDialect } from "@src/lib/connectors/dialects";
import {
  queryDefinitionSchema,
  type QueryDefinition,
  type QueryStep,
  type JoinStep,
  type FilterStep,
  type FilterItem,
  type MutateStep,
  type SummarizeStep,
  type SelectStep,
  type OrderStep,
  type LimitStep,
  type AggFn,
} from "./definition";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CompileResult {
  sql: string;
  params: unknown[];
}

export interface SchemaContext {
  /** Full schema from the connector */
  schema: SchemaInfo;
  dialect?: SqlDialect;
}

export class CompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompileError";
  }
}

// ---------------------------------------------------------------------------
// Schema validation helpers
// ---------------------------------------------------------------------------

function assertTableExists(tableName: string, schema: SchemaInfo): void {
  const found = schema.tables.some((t) => t.name === tableName);
  if (!found) {
    throw new CompileError(
      `Table "${tableName}" does not exist in this data source.`
    );
  }
}

function getTableColumns(tableName: string, schema: SchemaInfo): ColumnInfo[] {
  const table = schema.tables.find((t) => t.name === tableName);
  if (!table) {
    throw new CompileError(
      `Table "${tableName}" does not exist in this data source.`
    );
  }
  return table.columns;
}

// ---------------------------------------------------------------------------
// Compiler state — carried through each step
// ---------------------------------------------------------------------------

interface CompilerState {
  /** CTE definitions accumulated so far: [ name, body ] */
  ctes: { name: string; body: string }[];
  /** Collected bind parameters */
  params: unknown[];
  /** Name of the CTE that the next step should read from */
  currentCte: string;
  /** Columns visible at the current CTE layer */
  columns: string[];
  /** Counter for unique CTE names */
  stepIndex: number;
  /** The full data-source schema (for identifier validation) */
  schema: SchemaInfo;
  /** The target SQL dialect */
  dialect: SqlDialect;
}

function nextCteName(state: CompilerState): string {
  return `__s${state.stepIndex}`;
}

function q(name: string, state: CompilerState): string {
  return state.dialect.quoteIdent(name);
}

// ---------------------------------------------------------------------------
// Filter item → SQL fragment
// ---------------------------------------------------------------------------

function compileFilterItem(
  item: FilterItem,
  state: CompilerState,
  availableColumns: string[]
): string {
  const { column, op, value } = item;

  if (!availableColumns.includes(column)) {
    throw new CompileError(
      `Filter references unknown column "${column}". Available: ${availableColumns.join(", ")}.`
    );
  }

  const colExpr = q(column, state);

  switch (op) {
    case "is null":
      return `${colExpr} IS NULL`;

    case "is not null":
      return `${colExpr} IS NOT NULL`;

    case "=":
    case "!=":
    case ">":
    case ">=":
    case "<":
    case "<=": {
      state.params.push(value);
      const ph = state.dialect.placeholder(state.params.length);
      return `${colExpr} ${op} ${ph}`;
    }

    case "in":
    case "not in": {
      if (!Array.isArray(value) || value.length === 0) {
        throw new CompileError(
          `Operator "${op}" requires a non-empty array value for column "${column}".`
        );
      }
      const placeholders = (value as unknown[]).map((v) => {
        state.params.push(v);
        return state.dialect.placeholder(state.params.length);
      }).join(", ");
      return `${colExpr} ${op === "in" ? "IN" : "NOT IN"} (${placeholders})`;
    }

    case "contains": {
      state.params.push(`%${String(value)}%`);
      const ph = state.dialect.placeholder(state.params.length);
      return state.dialect.containsExpr(colExpr, ph, true);
    }

    case "starts with": {
      state.params.push(`${String(value)}%`);
      const ph = state.dialect.placeholder(state.params.length);
      return `${colExpr} LIKE ${ph}`;
    }

    case "between": {
      if (!Array.isArray(value) || value.length !== 2) {
        throw new CompileError(
          `Operator "between" requires [low, high] for column "${column}".`
        );
      }
      state.params.push((value as unknown[])[0]);
      const p1 = state.dialect.placeholder(state.params.length);
      state.params.push((value as unknown[])[1]);
      const p2 = state.dialect.placeholder(state.params.length);
      return `${colExpr} BETWEEN ${p1} AND ${p2}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Step compilers
// ---------------------------------------------------------------------------

function compileJoin(step: JoinStep, state: CompilerState): void {
  assertTableExists(step.table, state.schema);
  const joinCols = getTableColumns(step.table, state.schema);

  for (const cond of step.on) {
    if (!state.columns.includes(cond.left)) {
      throw new CompileError(
        `Join condition references unknown left column "${cond.left}".`
      );
    }
    if (!joinCols.some((c) => c.name === cond.right)) {
      throw new CompileError(
        `Join condition references unknown right column "${cond.right}" in table "${step.table}".`
      );
    }
  }

  const cteName = nextCteName(state);
  const joinKeyword = step.joinType === "inner" ? "INNER JOIN" : "LEFT JOIN";
  const onClause = step.on
    .map((cond) => `${q(state.currentCte, state)}.${q(cond.left, state)} = ${q(step.table, state)}.${q(cond.right, state)}`)
    .join(" AND ");

  const newCols = joinCols.map((c) => c.name);
  const mergedCols = [...state.columns, ...newCols.filter((c) => !state.columns.includes(c))];

  const selectList = [
    ...state.columns.map((c) => `${q(state.currentCte, state)}.${q(c, state)}`),
    ...newCols.map((c) => `${q(step.table, state)}.${q(c, state)} AS ${q(c, state)}`),
  ].join(", ");

  const body = `SELECT ${selectList} FROM ${q(state.currentCte, state)} ${joinKeyword} ${q(step.table, state)} ON ${onClause}`;

  state.ctes.push({ name: cteName, body });
  state.currentCte = cteName;
  state.columns = mergedCols;
  state.stepIndex++;
}

function compileFilter(step: FilterStep, state: CompilerState): void {
  const { logic, items } = step.conditions;
  const fragments = items.map((item) =>
    compileFilterItem(item, state, state.columns)
  );
  const whereClause = fragments.join(` ${logic.toUpperCase()} `);

  const cteName = nextCteName(state);
  const body = `SELECT * FROM ${q(state.currentCte, state)} WHERE ${whereClause}`;

  state.ctes.push({ name: cteName, body });
  state.currentCte = cteName;
  state.stepIndex++;
}

function compileMutate(step: MutateStep, state: CompilerState): void {
  const cteName = nextCteName(state);

  const otherCols = state.columns.filter((c) => c !== step.name).map((c) => q(c, state));
  const selectList = [...otherCols, `(${step.expression}) AS ${q(step.name, state)}`].join(", ");
  const body = `SELECT ${selectList} FROM ${q(state.currentCte, state)}`;

  state.ctes.push({ name: cteName, body });
  state.currentCte = cteName;
  if (!state.columns.includes(step.name)) {
    state.columns = [...state.columns, step.name];
  }
  state.stepIndex++;
}

function compileSummarize(step: SummarizeStep, state: CompilerState): void {
  for (const gb of step.groupBy) {
    if (!state.columns.includes(gb.column)) {
      throw new CompileError(
        `summarize groupBy references unknown column "${gb.column}".`
      );
    }
  }

  for (const agg of step.aggregates) {
    if (agg.fn !== "count" && !state.columns.includes(agg.column)) {
      throw new CompileError(
        `Aggregate "${agg.alias}" references unknown column "${agg.column}".`
      );
    }
  }

  const groupByExprs = step.groupBy.map((gb) => {
    const colExpr = q(gb.column, state);
    if (gb.dateGrain) {
      return `${state.dialect.dateTruncExpr(colExpr, gb.dateGrain)} AS ${q(gb.column, state)}`;
    }
    return `${colExpr} AS ${q(gb.column, state)}`;
  });

  const aggExprs = step.aggregates.map((agg) => {
    const colExpr = agg.fn === "count" && agg.column === "*" ? "*" : q(agg.column, state);
    return `${state.dialect.aggregateExpr(agg.fn as AggFn, colExpr)} AS ${q(agg.alias, state)}`;
  });

  const selectList = [...groupByExprs, ...aggExprs].join(", ");

  const groupByClause =
    step.groupBy.length > 0
      ? ` GROUP BY ${step.groupBy.map((_, i) => i + 1).join(", ")}`
      : "";

  const cteName = nextCteName(state);
  const body = `SELECT ${selectList} FROM ${q(state.currentCte, state)}${groupByClause}`;

  const newCols = [
    ...step.groupBy.map((gb) => gb.column),
    ...step.aggregates.map((agg) => agg.alias),
  ];

  state.ctes.push({ name: cteName, body });
  state.currentCte = cteName;
  state.columns = newCols;
  state.stepIndex++;
}

function compileSelect(step: SelectStep, state: CompilerState): void {
  for (const col of step.columns) {
    if (!state.columns.includes(col)) {
      throw new CompileError(
        `select references unknown column "${col}". Available: ${state.columns.join(", ")}.`
      );
    }
  }

  const cteName = nextCteName(state);
  const selectList = step.columns.map((c) => q(c, state)).join(", ");
  const body = `SELECT ${selectList} FROM ${q(state.currentCte, state)}`;

  state.ctes.push({ name: cteName, body });
  state.currentCte = cteName;
  state.columns = [...step.columns];
  state.stepIndex++;
}

function compileOrder(step: OrderStep, state: CompilerState): void {
  for (const item of step.items) {
    if (!state.columns.includes(item.column)) {
      throw new CompileError(
        `order references unknown column "${item.column}".`
      );
    }
  }

  const cteName = nextCteName(state);
  const orderClause = step.items
    .map((item) => `${q(item.column, state)} ${item.dir.toUpperCase()}`)
    .join(", ");

  // If dialect forbids ORDER BY in intermediate CTEs (e.g. MSSQL), use TOP 100 PERCENT
  const body = state.dialect.supportsOrderByInCte
    ? `SELECT * FROM ${q(state.currentCte, state)} ORDER BY ${orderClause}`
    : `SELECT TOP 100 PERCENT * FROM ${q(state.currentCte, state)} ORDER BY ${orderClause}`;

  state.ctes.push({ name: cteName, body });
  state.currentCte = cteName;
  state.stepIndex++;
}

function compileLimit(step: LimitStep, state: CompilerState): void {
  const cteName = nextCteName(state);
  const body = state.dialect.name === 'mssql'
    ? `SELECT TOP ${step.value} * FROM ${q(state.currentCte, state)}`
    : `SELECT * FROM ${q(state.currentCte, state)} LIMIT ${step.value}`;

  state.ctes.push({ name: cteName, body });
  state.currentCte = cteName;
  state.stepIndex++;
}

// ---------------------------------------------------------------------------
// Main compile function
// ---------------------------------------------------------------------------

export function compile(
  rawDefinition: unknown,
  schemaContext: SchemaContext,
  explicitDialect?: SqlDialect
): CompileResult {
  const definition: QueryDefinition = queryDefinitionSchema.parse(rawDefinition);
  const { schema } = schemaContext;
  const dialect: SqlDialect = explicitDialect ?? schemaContext.dialect ?? sqliteDialect;

  assertTableExists(definition.source.table, schema);
  const sourceColumns = getTableColumns(definition.source.table, schema).map(
    (c) => c.name
  );

  const initialCteName = "__s0";
  const state: CompilerState = {
    ctes: [
      {
        name: initialCteName,
        body: `SELECT * FROM ${dialect.quoteIdent(definition.source.table)}`,
      },
    ],
    params: [],
    currentCte: initialCteName,
    columns: sourceColumns,
    stepIndex: 1,
    schema,
    dialect,
  };

  for (const step of definition.steps) {
    compileStep(step, state);
  }

  const cteClause = state.ctes
    .map(({ name, body }) => `${dialect.quoteIdent(name)} AS (\n  ${body}\n)`)
    .join(",\n");

  const sql = `WITH ${cteClause}\nSELECT * FROM ${dialect.quoteIdent(state.currentCte)}`;

  return { sql, params: state.params };
}

function compileStep(step: QueryStep, state: CompilerState): void {
  switch (step.type) {
    case "join":
      compileJoin(step, state);
      break;
    case "filter":
      compileFilter(step, state);
      break;
    case "mutate":
      compileMutate(step, state);
      break;
    case "summarize":
      compileSummarize(step, state);
      break;
    case "select":
      compileSelect(step, state);
      break;
    case "order":
      compileOrder(step, state);
      break;
    case "limit":
      compileLimit(step, state);
      break;
  }
}
