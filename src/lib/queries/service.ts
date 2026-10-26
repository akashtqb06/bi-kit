import 'server-only';
import { eq } from "drizzle-orm";
import { db } from "@src/lib/db";
import { queries, charts, workbooks, type Query } from "@src/lib/db/schema";
import { NotFoundError } from "@src/lib/connectors/types";
import { getWorkbook } from "@src/lib/workbooks/service";
import { getDataSource } from "@src/lib/data-sources/service";
import { validateFolderAssignment } from "@src/lib/folders/service";
import { newId } from "@src/lib/db/id";
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
  folderId?: string | null;
  position?: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  createdBy?: string | null;
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
    folderId: row.folderId,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export function listQueries(workbookId?: string, user?: { id: string; role: string }): QueryPublic[] {
  if (workbookId) {
    if (user && user.role !== "admin") {
      const wb = db.select().from(workbooks).where(eq(workbooks.id, workbookId)).get();
      if (!wb || wb.ownerId !== user.id) return [];
    }
    const rows = db.select().from(queries).where(eq(queries.workbookId, workbookId)).all();
    return rows.map(toPublic);
  }

  if (user && user.role !== "admin") {
    const rows = db
      .select({ query: queries })
      .from(queries)
      .innerJoin(workbooks, eq(queries.workbookId, workbooks.id))
      .where(eq(workbooks.ownerId, user.id))
      .all();
    return rows.map((r) => toPublic(r.query));
  }

  const rows = db.select().from(queries).all();
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

export function createQuery(input: CreateQueryInput, createdBy?: string): QueryPublic {
  // Verify FK relationships are valid
  getWorkbook(input.workbookId);
  getDataSource(input.dataSourceId);
  if (input.folderId) {
    validateFolderAssignment(input.folderId, input.workbookId, 'query');
  }

  const definitionStr =
    typeof input.definition === 'string'
      ? input.definition
      : input.definition !== undefined
      ? JSON.stringify(input.definition)
      : "[]";

  const id = newId();
  db.insert(queries)
    .values({
      id,
      workbookId: input.workbookId,
      name: input.name,
      dataSourceId: input.dataSourceId,
      mode: input.mode ?? "builder",
      definition: definitionStr,
      sql: input.sql ?? "",
      folderId: input.folderId ?? null,
      position: input.position ?? 0,
      createdBy: createdBy ?? null,
    })
    .run();

  return getQueryPublic(id);
}

export function updateQuery(
  id: string,
  input: Partial<CreateQueryInput>
): QueryPublic {
  const current = getQuery(id); // throws if missing
  const updates: Partial<Query> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.mode !== undefined) updates.mode = input.mode;
  if (input.definition !== undefined) {
    updates.definition =
      typeof input.definition === 'string'
        ? input.definition
        : JSON.stringify(input.definition);
  }
  if (input.sql !== undefined) updates.sql = input.sql;
  if (input.folderId !== undefined) {
    if (input.folderId !== null) {
      validateFolderAssignment(input.folderId, current.workbookId, 'query');
    }
    updates.folderId = input.folderId ?? null;
  }
  if (input.position !== undefined) updates.position = input.position;
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

