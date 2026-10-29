import { describe, it, expect, beforeEach } from 'vitest';
import { OfflineQueue } from '../offline-queue';
import { MemoryStorageAdapter } from '../indexed-db';
import type { CreateTransactionDTO } from '@src/lib/finance/contract';

describe('PWA Offline Quick Add Queue', () => {
  let queue: OfflineQueue;
  let adapter: MemoryStorageAdapter;

  beforeEach(() => {
    adapter = new MemoryStorageAdapter();
    queue = new OfflineQueue(adapter);
  });

  const sampleTx1: CreateTransactionDTO = {
    accountId: 'acc-1',
    date: '2026-10-28',
    type: 'expense',
    amount: 150000, // 1500.00 INR
    payee: 'Grocery Store',
    note: 'Weekly essentials',
    categoryId: 'cat-groceries',
  };

  const sampleTx2: CreateTransactionDTO = {
    accountId: 'acc-2',
    date: '2026-10-28',
    type: 'income',
    amount: 5000000, // 50000.00 INR
    payee: 'Employer Inc',
    note: 'October Salary',
    categoryId: 'cat-salary',
  };

  it('enqueues a transaction with an idempotent clientRequestId', async () => {
    const customReqId = 'req-test-12345';
    const queued = await queue.enqueue(sampleTx1, customReqId);

    expect(queued.id).toBe(customReqId);
    expect(queued.clientRequestId).toBe(customReqId);
    expect(queued.status).toBe('pending');
    expect(queued.retryCount).toBe(0);
    expect(queued.lastError).toBeNull();
    expect(queued.data.amount).toBe(150000);
    expect(queued.data.clientRequestId).toBe(customReqId);

    const pendingCount = await queue.getPendingCount();
    expect(pendingCount).toBe(1);
  });

  it('generates an idempotent clientRequestId if none is provided', async () => {
    const queued = await queue.enqueue(sampleTx1);

    expect(queued.clientRequestId).toMatch(/^req-/);
    expect(queued.id).toBe(queued.clientRequestId);
    expect(queued.data.clientRequestId).toBe(queued.clientRequestId);
  });

  it('maintains strict FIFO order when retrieving pending transactions', async () => {
    const item1 = await queue.enqueue(sampleTx1, 'req-first');
    // slight delay for timestamp ordering
    await new Promise((r) => setTimeout(r, 10));
    const item2 = await queue.enqueue(sampleTx2, 'req-second');

    const pending = await queue.getPending();
    expect(pending.length).toBe(2);
    expect(pending[0].id).toBe(item1.id);
    expect(pending[1].id).toBe(item2.id);
    expect(pending[0].createdAt).toBeLessThanOrEqual(pending[1].createdAt);
  });

  it('updates item sync status and tracks retry counts', async () => {
    const queued = await queue.enqueue(sampleTx1, 'req-status-test');

    await queue.updateStatus(queued.id, 'syncing');
    let item = await queue.getItem(queued.id);
    expect(item?.status).toBe('syncing');

    await queue.updateStatus(queued.id, 'failed', 'Network timeout');
    item = await queue.getItem(queued.id);
    expect(item?.status).toBe('failed');
    expect(item?.lastError).toBe('Network timeout');
    expect(item?.retryCount).toBe(1);

    // Only 'pending' and 'syncing' are considered pending
    const pending = await queue.getPending();
    expect(pending.some((p) => p.id === queued.id)).toBe(false);
  });

  it('dequeues an item after successful sync', async () => {
    const queued = await queue.enqueue(sampleTx1, 'req-dequeue');
    expect(await queue.getPendingCount()).toBe(1);

    await queue.dequeue(queued.id);
    expect(await queue.getPendingCount()).toBe(0);
    expect(await queue.getItem(queued.id)).toBeNull();
  });

  it('notifies subscribers reactively on queue state changes', async () => {
    const events: number[] = [];
    const unsubscribe = queue.subscribe((count) => {
      events.push(count);
    });

    await queue.enqueue(sampleTx1, 'req-sub-1');
    await queue.enqueue(sampleTx2, 'req-sub-2');
    await queue.dequeue('req-sub-1');

    unsubscribe();
    await queue.enqueue(sampleTx1, 'req-sub-3');

    // Should include initial notification + enqueue + enqueue + dequeue
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events).toContain(1);
    expect(events).toContain(2);
  });

  it('clears all items in queue', async () => {
    await queue.enqueue(sampleTx1);
    await queue.enqueue(sampleTx2);
    expect(await queue.getPendingCount()).toBe(2);

    await queue.clear();
    expect(await queue.getPendingCount()).toBe(0);
  });
});
