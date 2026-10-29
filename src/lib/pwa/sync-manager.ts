import type { SyncResult, SyncState } from './types';
import { OfflineQueue, offlineQueue as defaultOfflineQueue } from './offline-queue';

export type FetchFunction = typeof fetch;
export type SyncListener = (state: SyncState) => void;

export interface SyncManagerOptions {
  queue?: OfflineQueue;
  fetchFn?: FetchFunction;
  apiUrl?: string;
  isOnlineFn?: () => boolean;
}

export class SyncManager {
  private queue: OfflineQueue;
  private fetchFn: FetchFunction;
  private apiUrl: string;
  private isOnlineFn: () => boolean;
  private syncing = false;
  private syncPromise: Promise<SyncResult> | null = null;
  private lastSyncedAt: number | null = null;
  private listeners: Set<SyncListener> = new Set();
  private cleanupWindowListener: (() => void) | null = null;

  constructor(options: SyncManagerOptions = {}) {
    this.queue = options.queue || defaultOfflineQueue;
    this.fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : (async () => ({} as Response)));
    this.apiUrl = options.apiUrl || '/api/finance/transactions';
    this.isOnlineFn =
      options.isOnlineFn ||
      (() => {
        if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
          return navigator.onLine;
        }
        return true;
      });

    // Subscribe to underlying queue changes
    this.queue.subscribe((count) => {
      this.notifyListeners(count);
    });

    // Auto-sync when network reconnects in browser
    if (typeof window !== 'undefined') {
      const handleOnline = () => {
        void this.sync();
      };
      window.addEventListener('online', handleOnline);
      this.cleanupWindowListener = () => {
        window.removeEventListener('online', handleOnline);
      };
    }
  }

  /**
   * Check whether the manager considers the network online.
   */
  get isOnline(): boolean {
    return this.isOnlineFn();
  }

  /**
   * Check whether a synchronization pass is currently in flight.
   */
  get isSyncing(): boolean {
    return this.syncing;
  }

  /**
   * Returns current pending transactions count.
   */
  async getPendingCount(): Promise<number> {
    return this.queue.getPendingCount();
  }

  /**
   * Returns current sync state snapshot.
   */
  async getState(): Promise<SyncState> {
    const pendingCount = await this.queue.getPendingCount();
    return {
      pendingCount,
      isSyncing: this.syncing,
      isOnline: this.isOnline,
      lastSyncedAt: this.lastSyncedAt,
    };
  }

  /**
   * Trigger synchronization of all pending transactions.
   * If a sync is already running, returns the existing promise.
   */
  async sync(): Promise<SyncResult> {
    if (this.syncPromise) {
      return this.syncPromise;
    }

    if (!this.isOnline) {
      const pendingCount = await this.queue.getPendingCount();
      return {
        total: pendingCount,
        synced: 0,
        failed: 0,
        remaining: pendingCount,
        errors: [{ id: 'network', error: 'Device is offline' }],
      };
    }

    this.syncing = true;
    this.syncPromise = this.performSync().finally(() => {
      this.syncing = false;
      this.syncPromise = null;
      void this.notifyListeners();
    });

    await this.notifyListeners();
    return this.syncPromise;
  }

  private async performSync(): Promise<SyncResult> {
    const pendingItems = await this.queue.getPending();
    const result: SyncResult = {
      total: pendingItems.length,
      synced: 0,
      failed: 0,
      remaining: pendingItems.length,
      errors: [],
    };

    if (pendingItems.length === 0) {
      return result;
    }

    for (const item of pendingItems) {
      // If network went offline mid-sync, pause and keep rest pending
      if (!this.isOnline) {
        break;
      }

      await this.queue.updateStatus(item.id, 'syncing');

      try {
        const response = await this.fetchFn(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Request-Id': item.clientRequestId,
          },
          body: JSON.stringify({
            ...item.data,
            clientRequestId: item.clientRequestId,
          }),
        });

        // 200/201: Created successfully
        // 409: Conflict (clientRequestId already executed on server - idempotent replay)
        if (response.status === 200 || response.status === 201 || response.status === 409) {
          await this.queue.dequeue(item.id);
          result.synced += 1;
          result.remaining -= 1;
        } else if (response.status >= 400 && response.status < 500) {
          // Unrecoverable client/validation error (e.g., account deleted)
          let errorMsg = `Server error ${response.status}`;
          try {
            const data = (await response.json()) as { error?: string };
            if (data?.error) errorMsg = data.error;
          } catch {
            // response was not JSON
          }

          await this.queue.updateStatus(item.id, 'failed', errorMsg);
          result.failed += 1;
          result.remaining -= 1;
          result.errors.push({ id: item.id, error: errorMsg });
        } else {
          // 5xx Server error: keep item pending for future retry
          await this.queue.updateStatus(item.id, 'pending', `Server temporarily unavailable: ${response.status}`);
          // Stop processing further items until next cycle
          break;
        }
      } catch (err) {
        // Network connection error / dropped fetch
        const message = err instanceof Error ? err.message : 'Network error';
        await this.queue.updateStatus(item.id, 'pending', message);
        result.errors.push({ id: item.id, error: message });
        // Abort the rest of this sync run since network is unreachable
        break;
      }
    }

    if (result.synced > 0) {
      this.lastSyncedAt = Date.now();
    }

    return result;
  }

  /**
   * Subscribe to sync state changes.
   */
  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    this.getState().then(listener).catch(() => {});

    return () => {
      this.listeners.delete(listener);
    };
  }

  private async notifyListeners(explicitCount?: number): Promise<void> {
    if (this.listeners.size === 0) return;
    const pendingCount = explicitCount !== undefined ? explicitCount : await this.queue.getPendingCount();
    const state: SyncState = {
      pendingCount,
      isSyncing: this.syncing,
      isOnline: this.isOnline,
      lastSyncedAt: this.lastSyncedAt,
    };
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  destroy(): void {
    if (this.cleanupWindowListener) {
      this.cleanupWindowListener();
      this.cleanupWindowListener = null;
    }
    this.listeners.clear();
  }
}

// Global default singleton instance
export const syncManager = new SyncManager();
