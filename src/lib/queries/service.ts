import { eq } from "drizzle-orm";
import { db } from "@src/lib/db";
import { queries, charts, type Query } from "@src/lib/db/schema";
import { NotFoundError } from "@src/lib/connectors/types";
import { getWorkbook } from "@src/lib/workbooks/service";
import { getDataSource } from "@src/lib/data-sources/service";
import type { CreateQueryInput } from "@src/lib/schemas";

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

export interface QueryPublic {
  id: string;
  workbookId: string;
  name: string;
  dataSourceId: string;
  mode: "builder" | "sql";
  definition: string; // raw JSON string of builder steps
  sql: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

function toPublic(row: Query): QueryPublic {
  return {
    id: row.id,
    workbookId: row.workbookId,
    name: row.name,
    dataSourceId: row.dataSourceId,
    mode: row.mode as "builder" | "sql",
    definition: row.definition,
    sql: row.sql,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export function listQueries(workbookId?: string): QueryPublic[] {
  const rows = workbookId
    ? db.select().from(queries).where(eq(queries.workbookId, workbookId)).all()
    : db.select().from(queries).all();
  return rows.map(toPublic);
}

export function getQuery(id: string): Query {
  const row = db.select().from(queries).where(eq(queries.id, id)).get();
  if (!row) throw new NotFoundError(`Query "${id}" not found.`);
  return row;
}

export function getQueryPublic(id: string): QueryPublic {
  return toPublic(getQuery(id));
}

export function createQuery(input: CreateQueryInput): QueryPublic {
  // Verify FK relationships are valid
  getWorkbook(input.workbookId);
  getDataSource(input.dataSourceId);

  db.insert(queries)
    .values({
      workbookId: input.workbookId,
      name: input.name,
      dataSourceId: input.dataSourceId,
      mode: input.mode ?? "sql",
      definition: input.definition ?? "[]",
      sql: input.sql ?? "",
    })
    .run();

  const rows = db.select().from(queries).orderBy(queries.createdAt).all();
  const row = rows.at(-1);
  if (!row) throw new Error("Insert succeeded but row not found");
  return toPublic(row);
}

export function updateQuery(
  id: string,
  input: Partial<CreateQueryInput>
): QueryPublic {
  getQuery(id); // throws if missing
  const updates: Partial<Query> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.mode !== undefined) updates.mode = input.mode;
  if (input.definition !== undefined) updates.definition = input.definition;
  if (input.sql !== undefined) updates.sql = input.sql;
  if (input.dataSourceId !== undefined) {
    getDataSource(input.dataSourceId);
    updates.dataSourceId = input.dataSourceId;
  }
  db.update(queries).set(updates).where(eq(queries.id, id)).run();
  return getQueryPublic(id);
}

export function deleteQuery(id: string): void {
  getQuery(id); // throws if missing
  const dep = db.select().from(charts).where(eq(charts.queryId, id)).get();
  if (dep) {
    throw new Error("Cannot delete: this query is referenced by one or more charts.");
  }
  db.delete(queries).where(eq(queries.id, id)).run();
}

