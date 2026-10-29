import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { folders, queries, charts, dashboards, type Folder } from '@src/lib/db/schema';
import { BadRequestError, ConflictError, NotFoundError } from '@src/lib/connectors/types';
import { getWorkbook } from '@src/lib/workbooks/service';
import { newId } from '@src/lib/db/id';
import type { CreateFolderInput, UpdateFolderInput, DeleteFolderMode } from '@src/lib/schemas';

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

export interface FolderPublic {
  id: string;
  workbookId: string;
  kind: 'query' | 'chart' | 'dashboard';
  name: string;
  parentId: string | null;
  position: number;
  itemCount?: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

function toPublic(row: Folder, itemCount?: number): FolderPublic {
  return {
    id: row.id,
    workbookId: row.workbookId,
    kind: row.kind as 'query' | 'chart' | 'dashboard',
    name: row.name,
    parentId: row.parentId ?? null,
    position: row.position,
    itemCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function listFolders(workbookId: string): Promise<FolderPublic[]> {
  const rows = await db
    .select()
    .from(folders)
    .where(eq(folders.workbookId, workbookId))
    .orderBy(folders.position, folders.name);

  return rows.map((r) => toPublic(r));
}

export async function getFolder(id: string): Promise<Folder> {
  const [row] = await db.select().from(folders).where(eq(folders.id, id)).limit(1);
  if (!row) throw new NotFoundError(`Folder "${id}" not found.`);
  return row;
}

export async function getFolderPublic(id: string): Promise<FolderPublic> {
  return toPublic(await getFolder(id));
}

export async function validateFolderAssignment(
  folderId: string | null | undefined,
  workbookId: string,
  kind: 'query' | 'chart' | 'dashboard'
): Promise<void> {
  if (!folderId) return;
  const folder = await getFolder(folderId);
  if (folder.workbookId !== workbookId) {
    throw new BadRequestError(`Folder "${folderId}" does not belong to workbook "${workbookId}".`);
  }
  if (folder.kind !== kind) {
    throw new BadRequestError(`Folder "${folderId}" is of kind "${folder.kind}", expected "${kind}".`);
  }
}

export async function createFolder(input: CreateFolderInput): Promise<FolderPublic> {
  await getWorkbook(input.workbookId);
  const name = input.name.trim();

  const [existing] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.workbookId, input.workbookId),
        eq(folders.kind, input.kind),
        eq(folders.name, name)
      )
    )
    .limit(1);

  if (existing) {
    throw new ConflictError(`A folder named "${name}" already exists in this section.`);
  }

  const id = newId();
  await db.insert(folders)
    .values({
      id,
      workbookId: input.workbookId,
      kind: input.kind,
      name,
      parentId: input.parentId ?? null,
      position: input.position ?? 0,
    });

  return await getFolderPublic(id);
}

export async function updateFolder(id: string, input: UpdateFolderInput): Promise<FolderPublic> {
  const current = await getFolder(id);
  const updates: Partial<Folder> = { updatedAt: new Date() };

  if (input.name !== undefined) {
    const name = input.name.trim();
    const [existing] = await db
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.workbookId, current.workbookId),
          eq(folders.kind, current.kind),
          eq(folders.name, name),
          sql`${folders.id} != ${id}`
        )
      )
      .limit(1);

    if (existing) {
      throw new ConflictError(`A folder named "${name}" already exists in this section.`);
    }
    updates.name = name;
  }

  if (input.position !== undefined) {
    updates.position = input.position;
  }

  await db.update(folders).set(updates).where(eq(folders.id, id));
  return await getFolderPublic(id);
}

export async function deleteFolder(id: string, mode: DeleteFolderMode = 'keep'): Promise<void> {
  const folder = await getFolder(id);

  await db.transaction(async (tx) => {
    if (mode === 'delete') {
      if (folder.kind === 'query') {
        const folderQueries = await tx
          .select({ id: queries.id })
          .from(queries)
          .where(eq(queries.folderId, id));
        const queryIds = folderQueries.map((q) => q.id);
        if (queryIds.length > 0) {
          await tx.delete(charts).where(inArray(charts.queryId, queryIds));
          await tx.delete(queries).where(eq(queries.folderId, id));
        }
      } else if (folder.kind === 'chart') {
        await tx.delete(charts).where(eq(charts.folderId, id));
      } else if (folder.kind === 'dashboard') {
        await tx.delete(dashboards).where(eq(dashboards.folderId, id));
      }
    } else {
      // mode === 'keep': items move to section root (folderId set to null)
      if (folder.kind === 'query') {
        await tx.update(queries).set({ folderId: null }).where(eq(queries.folderId, id));
      } else if (folder.kind === 'chart') {
        await tx.update(charts).set({ folderId: null }).where(eq(charts.folderId, id));
      } else if (folder.kind === 'dashboard') {
        await tx.update(dashboards).set({ folderId: null }).where(eq(dashboards.folderId, id));
      }
    }

    await tx.update(folders).set({ parentId: null }).where(eq(folders.parentId, id));
    await tx.delete(folders).where(eq(folders.id, id));
  });
}
