import { nanoid } from 'nanoid';
import type { CreateTransactionDTO } from '@src/lib/finance/contract';
import type { QueuedTransaction, SyncStatus } from './types';
import { createStorageAdapter, type StorageAdapter } from './indexed-db';

export type QueueListener = (pendingCount: number, items: QueuedTransaction[]) => void;

export class OfflineQueue {
  private adapter: StorageAdapter;
  private listeners: Set<QueueListener> = new Set();

  constructor(adapter?: StorageAdapter) {
    this.adapter = adapter || createStorageAdapter();
  }

  /**
   * Enqueue a new transaction into the offline queue with an idempotent clientRequestId.
   */
  async enqueue(
    data: CreateTransactionDTO,
    clientRequestId?: string
  ): Promise<QueuedTransaction> {
    const reqId = clientRequestId || data.clientRequestId || `req-${nanoid(16)}`;

    const queuedItem: QueuedTransaction = {
      id: reqId,
      clientRequestId: reqId,
      data: {
        ...data,
        clientRequestId: reqId,
      },
      createdAt: Date.now(),
      status: 'pending',
      retryCount: 0,
      lastError: null,
    };

    await this.adapter.put(queuedItem);
    await this.notifyListeners();
    return queuedItem;
  }

  /**
   * Remove a transaction from the queue once successfully synced or discarded.
   */
  async dequeue(id: string): Promise<void> {
    await this.adapter.delete(id);
    await this.notifyListeners();
  }

  /**
   * Retrieve a specific item by its clientRequestId.
   */
  async getItem(id: string): Promise<QueuedTransaction | null> {
    return this.adapter.get(id);
  }

  /**
   * Retrieve all items currently in the queue, sorted chronologically (FIFO).
   */
  async getAll(): Promise<QueuedTransaction[]> {
    const all = await this.adapter.getAll();
    return all.sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Retrieve only pending and active syncing items in FIFO order.
   */
  async getPending(): Promise<QueuedTransaction[]> {
    const all = await this.getAll();
    return all.filter((item) => item.status === 'pending' || item.status === 'syncing');
  }

  /**
   * Returns the count of transactions awaiting synchronization.
   */
  async getPendingCount(): Promise<number> {
    const pending = await this.getPending();
    return pending.length;
  }

  /**
   * Update the sync status or error state of a queued item.
   */
  async updateStatus(
    id: string,
    status: SyncStatus,
    error: string | null = null
  ): Promise<void> {
    const item = await this.adapter.get(id);
    if (!item) return;

    item.status = status;
    item.lastError = error;
    if (error !== null) {
      item.retryCount += 1;
    }

    await this.adapter.put(item);
    await this.notifyListeners();
  }

  /**
   * Clear all items from the queue.
   */
  async clear(): Promise<void> {
    await this.adapter.clear();
    await this.notifyListeners();
  }

  /**
   * Subscribe to queue state changes (for UI reactive updates).
   */
  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    // Initial notification with current state
    this.getPending().then((pending) => {
      listener(pending.length, pending);
    }).catch(() => {
      listener(0, []);
    });

    return () => {
      this.listeners.delete(listener);
    };
  }

  private async notifyListeners(): Promise<void> {
    if (this.listeners.size === 0) return;
    try {
      const pending = await this.getPending();
      for (const listener of this.listeners) {
        listener(pending.length, pending);
      }
    } catch {
      // Ignore listener notification errors
    }
  }
}

// Global singleton instance for application use
export const offlineQueue = new OfflineQueue();
