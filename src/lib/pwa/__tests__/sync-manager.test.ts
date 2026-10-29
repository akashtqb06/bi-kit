import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncManager } from '../sync-manager';
import { OfflineQueue } from '../offline-queue';
import { MemoryStorageAdapter } from '../indexed-db';
import type { CreateTransactionDTO } from '@src/lib/finance/contract';

describe('PWA Sync Manager with Idempotent clientRequestIds', () => {
  let queue: OfflineQueue;
  let adapter: MemoryStorageAdapter;

  const sampleTx: CreateTransactionDTO = {
    accountId: 'acc-1',
    date: '2026-10-28',
    type: 'expense',
    amount: 250000,
    payee: 'Coffee Shop',
    note: 'Espresso',
  };

  beforeEach(() => {
    adapter = new MemoryStorageAdapter();
    queue = new OfflineQueue(adapter);
  });

  it('successfully synchronizes queued transactions using idempotent headers', async () => {
    await queue.enqueue(sampleTx, 'req-idempotent-001');

    const mockFetch = vi.fn().mockImplementation(async (url, init) => {
      expect(url).toBe('/api/finance/transactions');
      expect(init.method).toBe('POST');
      expect(init.headers['X-Client-Request-Id']).toBe('req-idempotent-001');
      const body = JSON.parse(init.body);
      expect(body.clientRequestId).toBe('req-idempotent-001');
      expect(body.amount).toBe(250000);

      return new Response(JSON.stringify({ transaction: { id: 'tx-1', ...body } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const manager = new SyncManager({
      queue,
      fetchFn: mockFetch,
      isOnlineFn: () => true,
    });

    const result = await manager.sync();

    expect(result.total).toBe(1);
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.remaining).toBe(0);

    // Item should be dequeued
    expect(await queue.getPendingCount()).toBe(0);
  });

  it('treats 409 conflict as an idempotent duplicate success and dequeues', async () => {
    await queue.enqueue(sampleTx, 'req-dup-002');

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Transaction already exists' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const manager = new SyncManager({
      queue,
      fetchFn: mockFetch,
      isOnlineFn: () => true,
    });

    const result = await manager.sync();

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(await queue.getPendingCount()).toBe(0);
  });

  it('marks items as failed on 4xx client errors without infinite retries', async () => {
    const item = await queue.enqueue(sampleTx, 'req-invalid-003');

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid account ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const manager = new SyncManager({
      queue,
      fetchFn: mockFetch,
      isOnlineFn: () => true,
    });

    const result = await manager.sync();

    expect(result.failed).toBe(1);
    expect(result.synced).toBe(0);
    expect(result.errors[0].error).toBe('Invalid account ID');

    const stored = await queue.getItem(item.id);
    expect(stored?.status).toBe('failed');
    expect(stored?.lastError).toBe('Invalid account ID');
  });

  it('reverts item to pending on network interruption and halts batch', async () => {
    await queue.enqueue(sampleTx, 'req-net-1');
    await queue.enqueue(sampleTx, 'req-net-2');

    const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch (offline)'));

    const manager = new SyncManager({
      queue,
      fetchFn: mockFetch,
      isOnlineFn: () => true,
    });

    const result = await manager.sync();

    expect(result.synced).toBe(0);
    // Should stop after the first network failure
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const pending = await queue.getPending();
    expect(pending.length).toBe(2);
    expect(pending[0].status).toBe('pending');
  });

  it('aborts early if device is offline without calling fetch', async () => {
    await queue.enqueue(sampleTx, 'req-offline');

    const mockFetch = vi.fn();
    const manager = new SyncManager({
      queue,
      fetchFn: mockFetch,
      isOnlineFn: () => false,
    });

    const result = await manager.sync();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.synced).toBe(0);
    expect(result.errors[0].error).toBe('Device is offline');
  });

  it('deduplicates simultaneous sync calls into a single in-flight promise', async () => {
    await queue.enqueue(sampleTx, 'req-concurrent');

    let resolveFetch: (value: Response) => void;
    const pendingFetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    const mockFetch = vi.fn().mockReturnValue(pendingFetchPromise);

    const manager = new SyncManager({
      queue,
      fetchFn: mockFetch,
      isOnlineFn: () => true,
    });

    const sync1 = manager.sync();
    const sync2 = manager.sync();

    resolveFetch!(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const [res1, res2] = await Promise.all([sync1, sync2]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res1).toBe(res2);
  });
});
