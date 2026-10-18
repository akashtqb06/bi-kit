import { z } from "zod";

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

const identifierSchema = z.string().min(1).max(255);

// ---------------------------------------------------------------------------
// Join step
// ---------------------------------------------------------------------------

const joinConditionSchema = z.object({
  left: identifierSchema,
  right: identifierSchema,
});

const joinStepSchema = z.object({
  type: z.literal("join"),
  joinType: z.enum(["inner", "left"]),
  table: identifierSchema,
  on: z.array(joinConditionSchema).min(1),
});

// ---------------------------------------------------------------------------
// Filter step
// ---------------------------------------------------------------------------

export const filterOpSchema = z.enum([
  "=",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "in",
  "not in",
  "contains",
  "starts with",
  "between",
  "is null",
  "is not null",
]);

const filterItemSchema = z.object({
  column: identifierSchema,
  op: filterOpSchema,
  /** Required for all ops except "is null" / "is not null" */
  value: z.unknown().optional(),
});

const filterConditionsSchema = z.object({
  logic: z.enum(["and", "or"]),
  items: z.array(filterItemSchema).min(1),
});

const filterStepSchema = z.object({
  type: z.literal("filter"),
  conditions: filterConditionsSchema,
});

// ---------------------------------------------------------------------------
// Mutate step (computed column)
// ---------------------------------------------------------------------------

const mutateStepSchema = z.object({
  type: z.literal("mutate"),
  /** Alias name for the new column */
  name: identifierSchema,
  /** Raw SQL expression; identifiers within must already be quoted by the caller or come from allowlisted columns */
  expression: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Summarize step
// ---------------------------------------------------------------------------

export const dateGrainSchema = z.enum(["year", "month", "week", "day", "hour"]);

const groupByItemSchema = z.object({
  column: identifierSchema,
  dateGrain: dateGrainSchema.optional(),
});

export const aggFnSchema = z.enum([
  "count",
  "sum",
  "avg",
  "min",
  "max",
  "count_distinct",
]);

const aggregateItemSchema = z.object({
  fn: aggFnSchema,
  column: identifierSchema,
  alias: identifierSchema,
});

const summarizeStepSchema = z.object({
  type: z.literal("summarize"),
  groupBy: z.array(groupByItemSchema).default([]),
  aggregates: z.array(aggregateItemSchema).min(1),
});

// ---------------------------------------------------------------------------
// Select step
// ---------------------------------------------------------------------------

const selectStepSchema = z.object({
  type: z.literal("select"),
  columns: z.array(identifierSchema).min(1),
});

// ---------------------------------------------------------------------------
// Order step
// ---------------------------------------------------------------------------

const orderItemSchema = z.object({
  column: identifierSchema,
  dir: z.enum(["asc", "desc"]).default("asc"),
});

const orderStepSchema = z.object({
  type: z.literal("order"),
  items: z.array(orderItemSchema).min(1),
});

// ---------------------------------------------------------------------------
// Limit step
// ---------------------------------------------------------------------------

const limitStepSchema = z.object({
  type: z.literal("limit"),
  value: z.number().int().positive().max(100_000),
});

// ---------------------------------------------------------------------------
// Union discriminated step
// ---------------------------------------------------------------------------

export const queryStepSchema = z.discriminatedUnion("type", [
  joinStepSchema,
  filterStepSchema,
  mutateStepSchema,
  summarizeStepSchema,
  selectStepSchema,
  orderStepSchema,
  limitStepSchema,
]);

// ---------------------------------------------------------------------------
// Top-level query definition
// ---------------------------------------------------------------------------

export const querySourceSchema = z.object({
  table: identifierSchema,
});

export const queryDefinitionSchema = z.object({
  source: querySourceSchema,
  steps: z.array(queryStepSchema).default([]),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type FilterOp = z.infer<typeof filterOpSchema>;
export type FilterItem = z.infer<typeof filterItemSchema>;
export type FilterConditions = z.infer<typeof filterConditionsSchema>;
export type DateGrain = z.infer<typeof dateGrainSchema>;
export type GroupByItem = z.infer<typeof groupByItemSchema>;
export type AggFn = z.infer<typeof aggFnSchema>;
export type AggregateItem = z.infer<typeof aggregateItemSchema>;

export type JoinStep = z.infer<typeof joinStepSchema>;
export type FilterStep = z.infer<typeof filterStepSchema>;
export type MutateStep = z.infer<typeof mutateStepSchema>;
export type SummarizeStep = z.infer<typeof summarizeStepSchema>;
export type SelectStep = z.infer<typeof selectStepSchema>;
export type OrderStep = z.infer<typeof orderStepSchema>;
export type LimitStep = z.infer<typeof limitStepSchema>;
export type QueryStep = z.infer<typeof queryStepSchema>;
export type QuerySource = z.infer<typeof querySourceSchema>;
export type QueryDefinition = z.infer<typeof queryDefinitionSchema>;
