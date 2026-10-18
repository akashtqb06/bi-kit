/**
 * Query Engine Compiler
 * ---------------------
 * Compiles a QueryDefinition (JSON) into a parameterized SQLite SELECT.
 *
 * Architecture:
 *   Each step appends a CTE so the final query is:
 *     WITH __s0 AS (...source...),
 *          __s1 AS (SELECT ... FROM __s0 WHERE ...),
 *          ...
 *     SELECT * FROM __sN
 *
 * All user-supplied identifiers (table/column names) are double-quote escaped.
 * All filter values are bound as parameters — never interpolated.
 */

import type { SchemaInfo, ColumnInfo } from "@src/lib/connectors/types";
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
  type DateGrain,
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
}

export class CompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompileError";
  }
}

// ---------------------------------------------------------------------------
// Identifier quoting (SQLite: double-quote, escape embedded double-quotes)
// ---------------------------------------------------------------------------

function q(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
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
}

function nextCteName(state: CompilerState): string {
  return `__s${state.stepIndex}`;
}

// ---------------------------------------------------------------------------
// Date grain expression
// ---------------------------------------------------------------------------

function dateGrainExpr(col: string, grain: DateGrain): string {
  // SQLite date functions
  switch (grain) {
    case "year":
      return `strftime('%Y', ${col})`;
    case "month":
      return `strftime('%Y-%m', ${col})`;
    case "week":
      return `strftime('%Y-W%W', ${col})`;
    case "day":
      return `strftime('%Y-%m-%d', ${col})`;
    case "hour":
      return `strftime('%Y-%m-%d %H', ${col})`;
  }
}

// ---------------------------------------------------------------------------
// Aggregate function expression
// ---------------------------------------------------------------------------

function aggExpr(fn: AggFn, colExpr: string): string {
  switch (fn) {
    case "count":
      return `COUNT(${colExpr})`;
    case "sum":
      return `SUM(${colExpr})`;
    case "avg":
      return `AVG(${colExpr})`;
    case "min":
      return `MIN(${colExpr})`;
    case "max":
      return `MAX(${colExpr})`;
    case "count_distinct":
      return `COUNT(DISTINCT ${colExpr})`;
  }
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

  const colExpr = q(column);

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
      return `${colExpr} ${op} ?`;
    }

    case "in":
    case "not in": {
      if (!Array.isArray(value) || value.length === 0) {
        throw new CompileError(
          `Operator "${op}" requires a non-empty array value for column "${column}".`
        );
      }
      const placeholders = (value as unknown[]).map(() => "?").join(", ");
      state.params.push(...(value as unknown[]));
      return `${colExpr} ${op === "in" ? "IN" : "NOT IN"} (${placeholders})`;
    }

    case "contains": {
      state.params.push(`%${String(value)}%`);
      return `${colExpr} LIKE ?`;
    }

    case "starts with": {
      state.params.push(`${String(value)}%`);
      return `${colExpr} LIKE ?`;
    }

    case "between": {
      if (!Array.isArray(value) || value.length !== 2) {
        throw new CompileError(
          `Operator "between" requires [low, high] for column "${column}".`
        );
      }
      state.params.push((value as unknown[])[0], (value as unknown[])[1]);
      return `${colExpr} BETWEEN ? AND ?`;
    }
  }
}

// ---------------------------------------------------------------------------
// Step compilers
// ---------------------------------------------------------------------------

function compileJoin(step: JoinStep, state: CompilerState): void {
  assertTableExists(step.table, state.schema);
  const joinCols = getTableColumns(step.table, state.schema);

  // Validate join columns exist on both sides
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
    .map((cond) => `${q(state.currentCte)}.${q(cond.left)} = ${q(step.table)}.${q(cond.right)}`)
    .join(" AND ");

  // After join, available columns = existing + join table columns (unqualified)
  const newCols = joinCols.map((c) => c.name);
  const mergedCols = [...state.columns, ...newCols.filter((c) => !state.columns.includes(c))];

  const selectList = [
    ...state.columns.map((c) => `${q(state.currentCte)}.${q(c)}`),
    ...newCols.map((c) => `${q(step.table)}.${q(c)} AS ${q(c)}`),
  ].join(", ");

  const body = `SELECT ${selectList} FROM ${q(state.currentCte)} ${joinKeyword} ${q(step.table)} ON ${onClause}`;

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
  const body = `SELECT * FROM ${q(state.currentCte)} WHERE ${whereClause}`;

  state.ctes.push({ name: cteName, body });
  state.currentCte = cteName;
  state.stepIndex++;
  // columns unchanged
}

function compileMutate(step: MutateStep, state: CompilerState): void {
  const cteName = nextCteName(state);

  // expression may reference columns from the current CTE; we trust it's
  // valid SQL since it's a freeform expression validated at parse-time by length
  const otherCols = state.columns.filter((c) => c !== step.name).map((c) => q(c));
  const selectList = [...otherCols, `(${step.expression}) AS ${q(step.name)}`].join(", ");
  const body = `SELECT ${selectList} FROM ${q(state.currentCte)}`;

  state.ctes.push({ name: cteName, body });
  state.currentCte = cteName;
  if (!state.columns.includes(step.name)) {
    state.columns = [...state.columns, step.name];
  }
  state.stepIndex++;
}

function compileSummarize(step: SummarizeStep, state: CompilerState): void {
  // Validate groupBy columns
  for (const gb of step.groupBy) {
    if (!state.columns.includes(gb.column)) {
      throw new CompileError(
        `summarize groupBy references unknown column "${gb.column}".`
      );
    }
  }

  // Validate aggregate columns
  for (const agg of step.aggregates) {
    if (agg.fn !== "count" && !state.columns.includes(agg.column)) {
      throw new CompileError(
        `Aggregate "${agg.alias}" references unknown column "${agg.column}".`
      );
    }
  }

  // Build SELECT list
  const groupByExprs = step.groupBy.map((gb) => {
    const colExpr = q(gb.column);
    if (gb.dateGrain) {
      return `${dateGrainExpr(colExpr, gb.dateGrain)} AS ${q(gb.column)}`;
    }
    return `${colExpr} AS ${q(gb.column)}`;
  });

  const aggExprs = step.aggregates.map((agg) => {
    const colExpr = agg.fn === "count" && agg.column === "*" ? "*" : q(agg.column);
    return `${aggExpr(agg.fn, colExpr)} AS ${q(agg.alias)}`;
  });

  const selectList = [...groupByExprs, ...aggExprs].join(", ");

  // GROUP BY clause (use column position for grains to avoid re-quoting issues)
  const groupByClause =
    step.groupBy.length > 0
      ? ` GROUP BY ${step.groupBy.map((_, i) => i + 1).join(", ")}`
      : "";

  const cteName = nextCteName(state);
  const body = `SELECT ${selectList} FROM ${q(state.currentCte)}${groupByClause}`;

  // New column set = groupBy aliases + aggregate aliases
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
  const selectList = step.columns.map((c) => q(c)).join(", ");
  const body = `SELECT ${selectList} FROM ${q(state.currentCte)}`;

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
    .map((item) => `${q(item.column)} ${item.dir.toUpperCase()}`)
    .join(", ");
  const body = `SELECT * FROM ${q(state.currentCte)} ORDER BY ${orderClause}`;

  state.ctes.push({ name: cteName, body });
  state.currentCte = cteName;
  state.stepIndex++;
}

function compileLimit(step: LimitStep, state: CompilerState): void {
  const cteName = nextCteName(state);
  const body = `SELECT * FROM ${q(state.currentCte)} LIMIT ${step.value}`;

  state.ctes.push({ name: cteName, body });
  state.currentCte = cteName;
  state.stepIndex++;
}

// ---------------------------------------------------------------------------
// Main compile function
// ---------------------------------------------------------------------------

/**
 * Compile a raw (unknown) query definition object into parameterized SQL.
 *
 * @param rawDefinition - The definition object (will be Zod-validated internally)
 * @param schemaContext - Schema of the data source for identifier validation
 * @returns { sql, params } ready to execute via SqliteConnector.execute()
 * @throws CompileError on validation or structural errors
 * @throws ZodError on schema validation failures
 */
export function compile(
  rawDefinition: unknown,
  schemaContext: SchemaContext
): CompileResult {
  // Parse + validate the definition shape
  const definition: QueryDefinition = queryDefinitionSchema.parse(rawDefinition);
  const { schema } = schemaContext;

  // Validate the source table exists
  assertTableExists(definition.source.table, schema);
  const sourceColumns = getTableColumns(definition.source.table, schema).map(
    (c) => c.name
  );

  // Build initial state: CTE 0 = source table
  const initialCteName = "__s0";
  const state: CompilerState = {
    ctes: [
      {
        name: initialCteName,
        body: `SELECT * FROM ${q(definition.source.table)}`,
      },
    ],
    params: [],
    currentCte: initialCteName,
    columns: sourceColumns,
    stepIndex: 1,
    schema,
  };

  // Compile each step in order
  for (const step of definition.steps) {
    compileStep(step, state);
  }

  // Assemble final SQL
  const cteClause = state.ctes
    .map(({ name, body }) => `${q(name)} AS (\n  ${body}\n)`)
    .join(",\n");

  const sql = `WITH ${cteClause}\nSELECT * FROM ${q(state.currentCte)}`;

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

