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

export function listFolders(workbookId: string): FolderPublic[] {
  const rows = db
    .select()
    .from(folders)
    .where(eq(folders.workbookId, workbookId))
    .orderBy(folders.position, folders.name)
    .all();

  return rows.map((r) => toPublic(r));
}

export function getFolder(id: string): Folder {
  const row = db.select().from(folders).where(eq(folders.id, id)).get();
  if (!row) throw new NotFoundError(`Folder "${id}" not found.`);
  return row;
}

export function getFolderPublic(id: string): FolderPublic {
  return toPublic(getFolder(id));
}

export function validateFolderAssignment(
  folderId: string | null | undefined,
  workbookId: string,
  kind: 'query' | 'chart' | 'dashboard'
): void {
  if (!folderId) return;
  const folder = getFolder(folderId);
  if (folder.workbookId !== workbookId) {
    throw new BadRequestError(`Folder "${folderId}" does not belong to workbook "${workbookId}".`);
  }
  if (folder.kind !== kind) {
    throw new BadRequestError(`Folder "${folderId}" is of kind "${folder.kind}", expected "${kind}".`);
  }
}

export function createFolder(input: CreateFolderInput): FolderPublic {
  getWorkbook(input.workbookId);
  const name = input.name.trim();

  const existing = db
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.workbookId, input.workbookId),
        eq(folders.kind, input.kind),
        eq(folders.name, name)
      )
    )
    .get();

  if (existing) {
    throw new ConflictError(`A folder named "${name}" already exists in this section.`);
  }

  const id = newId();
  db.insert(folders)
    .values({
      id,
      workbookId: input.workbookId,
      kind: input.kind,
      name,
      parentId: input.parentId ?? null,
      position: input.position ?? 0,
    })
    .run();

  return getFolderPublic(id);
}

export function updateFolder(id: string, input: UpdateFolderInput): FolderPublic {
  const current = getFolder(id);
  const updates: Partial<Folder> = { updatedAt: new Date() };

  if (input.name !== undefined) {
    const name = input.name.trim();
    const existing = db
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
      .get();

    if (existing) {
      throw new ConflictError(`A folder named "${name}" already exists in this section.`);
    }
    updates.name = name;
  }

  if (input.position !== undefined) {
    updates.position = input.position;
  }

  db.update(folders).set(updates).where(eq(folders.id, id)).run();
  return getFolderPublic(id);
}

export function deleteFolder(id: string, mode: DeleteFolderMode = 'keep'): void {
  const folder = getFolder(id);

  db.transaction((tx) => {
    if (mode === 'delete') {
      if (folder.kind === 'query') {
        const folderQueries = tx
          .select({ id: queries.id })
          .from(queries)
          .where(eq(queries.folderId, id))
          .all();
        const queryIds = folderQueries.map((q) => q.id);
        if (queryIds.length > 0) {
          tx.delete(charts).where(inArray(charts.queryId, queryIds)).run();
          tx.delete(queries).where(eq(queries.folderId, id)).run();
        }
      } else if (folder.kind === 'chart') {
        tx.delete(charts).where(eq(charts.folderId, id)).run();
      } else if (folder.kind === 'dashboard') {
        tx.delete(dashboards).where(eq(dashboards.folderId, id)).run();
      }
    } else {
      // mode === 'keep': items move to section root (folderId set to null)
      if (folder.kind === 'query') {
        tx.update(queries).set({ folderId: null }).where(eq(queries.folderId, id)).run();
      } else if (folder.kind === 'chart') {
        tx.update(charts).set({ folderId: null }).where(eq(charts.folderId, id)).run();
      } else if (folder.kind === 'dashboard') {
        tx.update(dashboards).set({ folderId: null }).where(eq(dashboards.folderId, id)).run();
      }
    }

    tx.update(folders).set({ parentId: null }).where(eq(folders.parentId, id)).run();
    tx.delete(folders).where(eq(folders.id, id)).run();
  });
}
