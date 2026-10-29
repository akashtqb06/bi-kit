import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@src/lib/db/schema';

let currentSessionUser: User | null = null;
let admin: User;
let member: User;

vi.mock('@src/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@src/lib/auth/session')>();
  return {
    ...actual,
    getSession: vi.fn(async () => {
      if (!currentSessionUser) return null;
      return {
        user: currentSessionUser,
        session: {
          id: 'test-session',
          userId: currentSessionUser.id,
          tokenHash: 'hash',
          createdAt: new Date(),
          lastUsedAt: new Date(),
          expiresAt: new Date(Date.now() + 3600_000),
          ipAddress: '127.0.0.1',
          userAgent: 'Vitest',
        },
      };
    }),
  };
});

const { db } = await import('@src/lib/db');
const { createWorkbook, duplicateWorkbook } = await import('@src/lib/workbooks/service');
const { createFolder, getFolder, listFolders } = await import('@src/lib/folders/service');
const { createQuery, getQuery } = await import('@src/lib/queries/service');
const { createChart, getChart } = await import('@src/lib/charts/service');
const { createDashboard, getDashboard } = await import('@src/lib/dashboards/service');
const { folders, queries, charts, dashboards, dataSources, users } = await import('@src/lib/db/schema');
const { newId } = await import('@src/lib/db/id');
const { eq } = await import('drizzle-orm');

const folderCollectionApi = await import('@src/app/api/folders/route');
const folderDetailApi = await import('@src/app/api/folders/[id]/route');
const workbookFoldersApi = await import('@src/app/api/workbooks/[id]/folders/route');
const queryDetailApi = await import('@src/app/api/queries/[id]/route');
const chartDetailApi = await import('@src/app/api/charts/[id]/route');
const dashboardDetailApi = await import('@src/app/api/dashboards/[id]/route');

beforeEach(async () => {
  const [adminUser] = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
  const [memberUser] = await db.select().from(users).where(eq(users.role, 'member')).limit(1);
  admin = adminUser!;
  member = memberUser!;
  currentSessionUser = admin;
});

describe('Folders backend services and API routes', () => {
  it('creates and lists folders in a workbook via API', async () => {
    const wb = await createWorkbook({ name: 'Folder WB 1' }, admin.id);

    // Create a query folder
    const postReq = new Request('http://localhost/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workbookId: wb.id,
        kind: 'query',
        name: '  Sales Queries  ',
      }),
    });
    const postRes = await folderCollectionApi.POST(postReq);
    expect(postRes.status).toBe(201);
    const postJson = await postRes.json();
    expect(postJson.data.name).toBe('Sales Queries');
    expect(postJson.data.kind).toBe('query');
    expect(postJson.data.workbookId).toBe(wb.id);

    // List folders via GET /api/workbooks/[id]/folders
    const listRes = await workbookFoldersApi.GET(new Request('http://localhost'), {
      params: Promise.resolve({ id: wb.id }),
    });
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    expect(listJson.data).toHaveLength(1);
    expect(listJson.data[0].name).toBe('Sales Queries');
  });

  it('rejects duplicate folder name with 409 Conflict', async () => {
    const wb = await createWorkbook({ name: 'Folder WB Dups' }, admin.id);
    await createFolder({ workbookId: wb.id, kind: 'chart', name: 'Revenue' });

    // Same kind, same name -> 409
    const req = new Request('http://localhost/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workbookId: wb.id,
        kind: 'chart',
        name: 'Revenue',
      }),
    });
    const res = await folderCollectionApi.POST(req);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/already exists/i);

    // Different kind, same name -> allowed
    const diffKindReq = new Request('http://localhost/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workbookId: wb.id,
        kind: 'query',
        name: 'Revenue',
      }),
    });
    const diffKindRes = await folderCollectionApi.POST(diffKindReq);
    expect(diffKindRes.status).toBe(201);
  });

  it('renames folder via PATCH and rejects renaming to duplicate name', async () => {
    const wb = await createWorkbook({ name: 'Folder WB Rename' }, admin.id);
    const f1 = await createFolder({ workbookId: wb.id, kind: 'query', name: 'Original Name' });
    const f2 = await createFolder({ workbookId: wb.id, kind: 'query', name: 'Existing Name' });
    expect(f2.name).toBe('Existing Name');

    // Successful rename
    const patchReq = new Request(`http://localhost/api/folders/${f1.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Name', position: 5 }),
    });
    const patchRes = await folderDetailApi.PATCH(patchReq, {
      params: Promise.resolve({ id: f1.id }),
    });
    expect(patchRes.status).toBe(200);
    const patchJson = await patchRes.json();
    expect(patchJson.data.name).toBe('Updated Name');
    expect(patchJson.data.position).toBe(5);

    // Rename to existing name in same section -> 409
    const dupReq = new Request(`http://localhost/api/folders/${f1.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Existing Name' }),
    });
    const dupRes = await folderDetailApi.PATCH(dupReq, {
      params: Promise.resolve({ id: f1.id }),
    });
    expect(dupRes.status).toBe(409);
  });

  it('moves items into folders and back to root via PATCH', async () => {
    const wb = await createWorkbook({ name: 'Folder WB Move' }, admin.id);
    const dsId = newId();
    await db.insert(dataSources)
      .values({
        id: dsId,
        ownerId: admin.id,
        name: 'Test DS',
        type: 'sqlite',
        config: { path: ':memory:' },
      });

    const qFolder = await createFolder({ workbookId: wb.id, kind: 'query', name: 'Q Folder' });
    const cFolder = await createFolder({ workbookId: wb.id, kind: 'chart', name: 'C Folder' });
    const dFolder = await createFolder({ workbookId: wb.id, kind: 'dashboard', name: 'D Folder' });

    const query = await createQuery({ workbookId: wb.id, dataSourceId: dsId, name: 'My Query' });
    const chart = await createChart({ name: 'My Chart', queryId: query.id, type: 'bar' });
    const dashboard = await createDashboard(wb.id, { name: 'My Dashboard' });

    // Move query to qFolder
    const moveQRes = await queryDetailApi.PATCH(
      new Request(`http://localhost/api/queries/${query.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: qFolder.id }),
      }),
      { params: Promise.resolve({ id: query.id }) }
    );
    expect(moveQRes.status).toBe(200);
    expect((await getQuery(query.id)).folderId).toBe(qFolder.id);

    // Move chart to cFolder
    const moveCRes = await chartDetailApi.PATCH(
      new Request(`http://localhost/api/charts/${chart.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: cFolder.id }),
      }),
      { params: Promise.resolve({ id: chart.id }) }
    );
    expect(moveCRes.status).toBe(200);
    expect((await getChart(chart.id)).folderId).toBe(cFolder.id);

    // Move dashboard to dFolder
    const moveDRes = await dashboardDetailApi.PATCH(
      new Request(`http://localhost/api/dashboards/${dashboard.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: dFolder.id }),
      }),
      { params: Promise.resolve({ id: dashboard.id }) }
    );
    expect(moveDRes.status).toBe(200);
    expect((await getDashboard(dashboard.id)).folderId).toBe(dFolder.id);

    // Move query back to root (folderId: null)
    const rootQRes = await queryDetailApi.PATCH(
      new Request(`http://localhost/api/queries/${query.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: null }),
      }),
      { params: Promise.resolve({ id: query.id }) }
    );
    expect(rootQRes.status).toBe(200);
    expect((await getQuery(query.id)).folderId).toBeNull();
  });

  it('rejects cross-workbook and cross-kind folderId assignments', async () => {
    const wb1 = await createWorkbook({ name: 'WB 1' }, admin.id);
    const wb2 = await createWorkbook({ name: 'WB 2' }, admin.id);
    const dsId = newId();
    await db.insert(dataSources)
      .values({
        id: dsId,
        ownerId: admin.id,
        name: 'Test DS Cross',
        type: 'sqlite',
        config: { path: ':memory:' },
      });

    const wb2Folder = await createFolder({ workbookId: wb2.id, kind: 'query', name: 'WB2 Query Folder' });
    const wb1ChartFolder = await createFolder({ workbookId: wb1.id, kind: 'chart', name: 'WB1 Chart Folder' });
    const query = await createQuery({ workbookId: wb1.id, dataSourceId: dsId, name: 'WB1 Query' });

    // Cross-workbook assignment -> rejected with 400
    const crossWbRes = await queryDetailApi.PATCH(
      new Request(`http://localhost/api/queries/${query.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: wb2Folder.id }),
      }),
      { params: Promise.resolve({ id: query.id }) }
    );
    expect(crossWbRes.status).toBe(400);

    // Cross-kind assignment (query assigned to chart folder) -> rejected with 400
    const crossKindRes = await queryDetailApi.PATCH(
      new Request(`http://localhost/api/queries/${query.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: wb1ChartFolder.id }),
      }),
      { params: Promise.resolve({ id: query.id }) }
    );
    expect(crossKindRes.status).toBe(400);
  });

  it("returns 404 when another user accesses private workbook's folders", async () => {
    // Admin creates workbook
    const adminWb = await createWorkbook({ name: "Admin's Private WB" }, admin.id);
    const adminFolder = await createFolder({ workbookId: adminWb.id, kind: 'query', name: 'Secret' });

    // Member attempts to access admin's workbook folders
    currentSessionUser = member;

    // GET /api/workbooks/[id]/folders
    const getRes = await workbookFoldersApi.GET(new Request('http://localhost'), {
      params: Promise.resolve({ id: adminWb.id }),
    });
    expect(getRes.status).toBe(404);

    // POST /api/folders
    const postRes = await folderCollectionApi.POST(
      new Request('http://localhost/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workbookId: adminWb.id,
          kind: 'query',
          name: 'Hacked Folder',
        }),
      })
    );
    expect(postRes.status).toBe(404);

    // PATCH /api/folders/[id]
    const patchRes = await folderDetailApi.PATCH(
      new Request(`http://localhost/api/folders/${adminFolder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hacked Rename' }),
      }),
      { params: Promise.resolve({ id: adminFolder.id }) }
    );
    expect(patchRes.status).toBe(404);

    // DELETE /api/folders/[id]
    const delRes = await folderDetailApi.DELETE(
      new Request(`http://localhost/api/folders/${adminFolder.id}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: adminFolder.id }) }
    );
    expect(delRes.status).toBe(404);
  });

  it('deletes folder with mode=keep (default) moving items to root', async () => {
    const wb = await createWorkbook({ name: 'WB Keep Test' }, admin.id);
    const dsId = newId();
    await db.insert(dataSources)
      .values({
        id: dsId,
        ownerId: admin.id,
        name: 'Test DS Keep',
        type: 'sqlite',
        config: { path: ':memory:' },
      });

    const folder = await createFolder({ workbookId: wb.id, kind: 'query', name: 'Queries to Keep' });
    const q1 = await createQuery({ workbookId: wb.id, dataSourceId: dsId, name: 'Q1', folderId: folder.id });
    const q2 = await createQuery({ workbookId: wb.id, dataSourceId: dsId, name: 'Q2', folderId: folder.id });

    // DELETE without mode query parameter defaults to 'keep'
    const res = await folderDetailApi.DELETE(
      new Request(`http://localhost/api/folders/${folder.id}`),
      { params: Promise.resolve({ id: folder.id }) }
    );
    expect(res.status).toBe(200);

    // Folder is gone
    const [foundFolder] = await db.select().from(folders).where(eq(folders.id, folder.id));
    expect(foundFolder).toBeUndefined();

    // Items still exist and have folderId = null
    const row1 = await getQuery(q1.id);
    const row2 = await getQuery(q2.id);
    expect(row1.folderId).toBeNull();
    expect(row2.folderId).toBeNull();
  });

  it('deletes folder with mode=delete cascading to items inside', async () => {
    const wb = await createWorkbook({ name: 'WB Delete Test' }, admin.id);
    const dsId = newId();
    await db.insert(dataSources)
      .values({
        id: dsId,
        ownerId: admin.id,
        name: 'Test DS Del',
        type: 'sqlite',
        config: { path: ':memory:' },
      });

    const folder = await createFolder({ workbookId: wb.id, kind: 'query', name: 'Queries to Delete' });
    const q1 = await createQuery({ workbookId: wb.id, dataSourceId: dsId, name: 'Q Del 1', folderId: folder.id });
    const q2 = await createQuery({ workbookId: wb.id, dataSourceId: dsId, name: 'Q Del 2', folderId: folder.id });

    const res = await folderDetailApi.DELETE(
      new Request(`http://localhost/api/folders/${folder.id}?mode=delete`),
      { params: Promise.resolve({ id: folder.id }) }
    );
    expect(res.status).toBe(200);

    // Folder is gone
    const [foundFolder] = await db.select().from(folders).where(eq(folders.id, folder.id));
    expect(foundFolder).toBeUndefined();

    // Queries inside are deleted
    const [foundQ1] = await db.select().from(queries).where(eq(queries.id, q1.id));
    const [foundQ2] = await db.select().from(queries).where(eq(queries.id, q2.id));
    expect(foundQ1).toBeUndefined();
    expect(foundQ2).toBeUndefined();
  });

  it('duplicates workbook, copying folders and remapping folderId for copied items', async () => {
    const wb = await createWorkbook({ name: 'Source WB Duplication' }, admin.id);
    const dsId = newId();
    await db.insert(dataSources)
      .values({
        id: dsId,
        ownerId: admin.id,
        name: 'Test DS Dup',
        type: 'sqlite',
        config: { path: ':memory:' },
      });

    const fQuery = await createFolder({ workbookId: wb.id, kind: 'query', name: 'Source Q Folder' });
    const fChart = await createFolder({ workbookId: wb.id, kind: 'chart', name: 'Source C Folder' });
    const fDash = await createFolder({ workbookId: wb.id, kind: 'dashboard', name: 'Source D Folder' });

    const query = await createQuery({ workbookId: wb.id, dataSourceId: dsId, name: 'Src Q', folderId: fQuery.id });
    const chart = await createChart({ name: 'Src C', queryId: query.id, type: 'bar', folderId: fChart.id });
    const dashboard = await createDashboard(wb.id, { name: 'Src D', folderId: fDash.id });
    expect(chart.id).toBeDefined();
    expect(dashboard.id).toBeDefined();

    // Duplicate workbook
    const copy = await duplicateWorkbook(wb.id, 'Target WB Copy', admin.id);
    expect(copy.id).not.toBe(wb.id);

    // Copied folders exist in new workbook
    const copiedFolders = await listFolders(copy.id);
    expect(copiedFolders).toHaveLength(3);
    const copiedQFolder = copiedFolders.find((f) => f.kind === 'query');
    const copiedCFolder = copiedFolders.find((f) => f.kind === 'chart');
    const copiedDFolder = copiedFolders.find((f) => f.kind === 'dashboard');

    expect(copiedQFolder).toBeDefined();
    expect(copiedQFolder!.id).not.toBe(fQuery.id);
    expect(copiedQFolder!.name).toBe('Source Q Folder');

    // Copied query has remapped folderId
    const copiedQueries = await db.select().from(queries).where(eq(queries.workbookId, copy.id));
    expect(copiedQueries).toHaveLength(1);
    expect(copiedQueries[0].folderId).toBe(copiedQFolder!.id);

    // Copied chart has remapped folderId
    const copiedCharts = await db.select().from(charts).where(eq(charts.workbookId, copy.id));
    expect(copiedCharts).toHaveLength(1);
    expect(copiedCharts[0].folderId).toBe(copiedCFolder!.id);

    // Copied dashboard has remapped folderId
    const copiedDashboards = await db.select().from(dashboards).where(eq(dashboards.workbookId, copy.id));
    expect(copiedDashboards).toHaveLength(1);
    expect(copiedDashboards[0].folderId).toBe(copiedDFolder!.id);
  });

  it('allows member to create, rename, move, delete folders and duplicate their own workbook', async () => {
    currentSessionUser = member;

    // Member creates their own workbook
    const memberWb = await createWorkbook({ name: 'Member Portfolio' }, member.id);

    // 1. Create folders in all three sections
    for (const kind of ['query', 'chart', 'dashboard'] as const) {
      const res = await folderCollectionApi.POST(
        new Request('http://localhost/api/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workbookId: memberWb.id,
            kind,
            name: `${kind.toUpperCase()} Folder`,
          }),
        })
      );
      expect(res.status).toBe(201);
    }

    const memberFolders = await listFolders(memberWb.id);
    expect(memberFolders).toHaveLength(3);
    const qFolder = memberFolders.find((f) => f.kind === 'query')!;

    // 2. Rename folder as member
    const renameRes = await folderDetailApi.PATCH(
      new Request(`http://localhost/api/folders/${qFolder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Renamed Q Folder' }),
      }),
      { params: Promise.resolve({ id: qFolder.id }) }
    );
    expect(renameRes.status).toBe(200);
    expect((await getFolder(qFolder.id)).name).toBe('Renamed Q Folder');

    // 3. Duplicate member workbook
    const dupCopy = await duplicateWorkbook(memberWb.id, 'Member Copy', member.id);
    const dupFolders = await listFolders(dupCopy.id);
    expect(dupFolders).toHaveLength(3);
    expect(dupFolders.some((f) => f.name === 'Renamed Q Folder')).toBe(true);
  });
});
