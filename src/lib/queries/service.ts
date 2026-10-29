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
  mode: "builder" | "sql" | "pipeline";
  definition: string; // raw JSON string of builder steps
  sql: string;
  folderId?: string | null;
  position?: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  createdBy?: string | null;
}

function toPublic(row: Query): QueryPublic {
  const defStr =
    typeof row.definition === "string"
      ? row.definition
      : JSON.stringify(row.definition ?? []);

  return {
    id: row.id,
    workbookId: row.workbookId,
    name: row.name,
    dataSourceId: row.dataSourceId,
    mode: row.mode as "builder" | "sql" | "pipeline",
    definition: defStr,
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

export async function listQueries(
  workbookId?: string,
  user?: { id: string; role: string }
): Promise<QueryPublic[]> {
  if (workbookId) {
    if (user && user.role !== "admin") {
      const [wb] = await db.select().from(workbooks).where(eq(workbooks.id, workbookId)).limit(1);
      if (!wb || wb.ownerId !== user.id) return [];
    }
    const rows = await db.select().from(queries).where(eq(queries.workbookId, workbookId));
    return rows.map(toPublic);
  }

  if (user && user.role !== "admin") {
    const rows = await db
      .select({ query: queries })
      .from(queries)
      .innerJoin(workbooks, eq(queries.workbookId, workbooks.id))
      .where(eq(workbooks.ownerId, user.id));
    return rows.map((r) => toPublic(r.query));
  }

  const rows = await db.select().from(queries);
  return rows.map(toPublic);
}

export async function getQuery(id: string): Promise<Query> {
  const [row] = await db.select().from(queries).where(eq(queries.id, id)).limit(1);
  if (!row) throw new NotFoundError(`Query "${id}" not found.`);
  return row;
}

export async function getQueryPublic(id: string): Promise<QueryPublic> {
  return toPublic(await getQuery(id));
}

export async function createQuery(input: CreateQueryInput, createdBy?: string): Promise<QueryPublic> {
  // Verify FK relationships are valid
  await getWorkbook(input.workbookId);
  await getDataSource(input.dataSourceId);
  if (input.folderId) {
    await validateFolderAssignment(input.folderId, input.workbookId, 'query');
  }

  let definitionVal: unknown = input.definition ?? [];
  if (typeof input.definition === 'string') {
    try {
      definitionVal = JSON.parse(input.definition);
    } catch {
      definitionVal = input.definition;
    }
  }

  const id = newId();
  await db.insert(queries).values({
    id,
    workbookId: input.workbookId,
    name: input.name,
    dataSourceId: input.dataSourceId,
    mode: input.mode ?? "builder",
    definition: definitionVal,
    sql: input.sql ?? "",
    folderId: input.folderId ?? null,
    position: input.position ?? 0,
    createdBy: createdBy ?? null,
  });

  return await getQueryPublic(id);
}

export async function updateQuery(
  id: string,
  input: Partial<CreateQueryInput>
): Promise<QueryPublic> {
  const current = await getQuery(id); // throws if missing
  const updates: Partial<typeof queries.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.mode !== undefined) updates.mode = input.mode;
  if (input.definition !== undefined) {
    if (typeof input.definition === 'string') {
      try {
        updates.definition = JSON.parse(input.definition);
      } catch {
        updates.definition = input.definition;
      }
    } else {
      updates.definition = input.definition;
    }
  }
  if (input.sql !== undefined) updates.sql = input.sql;
  if (input.folderId !== undefined) {
    if (input.folderId !== null) {
      await validateFolderAssignment(input.folderId, current.workbookId, 'query');
    }
    updates.folderId = input.folderId ?? null;
  }
  if (input.position !== undefined) updates.position = input.position;
  if (input.dataSourceId !== undefined) {
    await getDataSource(input.dataSourceId);
    updates.dataSourceId = input.dataSourceId;
  }
  await db.update(queries).set(updates).where(eq(queries.id, id));
  return await getQueryPublic(id);
}

export async function deleteQuery(id: string): Promise<void> {
  await getQuery(id); // throws if missing
  const [dep] = await db.select().from(charts).where(eq(charts.queryId, id)).limit(1);
  if (dep) {
    throw new Error("Cannot delete: this query is referenced by one or more charts.");
  }
  await db.delete(queries).where(eq(queries.id, id));
}
