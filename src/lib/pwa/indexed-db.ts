import type { QueuedTransaction } from './types';

const DB_NAME = 'bikit_finance_offline';
const DB_VERSION = 1;
const STORE_NAME = 'quick_add_queue';

export interface StorageAdapter {
  get(id: string): Promise<QueuedTransaction | null>;
  getAll(): Promise<QueuedTransaction[]>;
  put(item: QueuedTransaction): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * In-memory fallback storage adapter used during SSR or in Node environments
 * where IndexedDB is not natively available.
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, QueuedTransaction>();

  async get(id: string): Promise<QueuedTransaction | null> {
    return this.store.get(id) || null;
  }

  async getAll(): Promise<QueuedTransaction[]> {
    return Array.from(this.store.values());
  }

  async put(item: QueuedTransaction): Promise<void> {
    this.store.set(item.id, { ...item });
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

/**
 * IndexedDB storage adapter for durable browser persistence.
 */
export class IndexedDBStorageAdapter implements StorageAdapter {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private customIdbFactory: IDBFactory | null = null;

  constructor(idbFactory?: IDBFactory) {
    if (idbFactory) {
      this.customIdbFactory = idbFactory;
    }
  }

  private getIdb(): IDBFactory | null {
    if (this.customIdbFactory) return this.customIdbFactory;
    if (typeof window !== 'undefined' && window.indexedDB) {
      return window.indexedDB;
    }
    return null;
  }

  private async openDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    const idb = this.getIdb();
    if (!idb) {
      throw new Error('IndexedDB is not available in the current environment');
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = idb.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  async get(id: string): Promise<QueuedTransaction | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve((request.result as QueuedTransaction) || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(): Promise<QueuedTransaction[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve((request.result as QueuedTransaction[]) || []);
      request.onerror = () => reject(request.error);
    });
  }

  async put(item: QueuedTransaction): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(item);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async delete(id: string): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * Creates the appropriate storage adapter depending on the runtime environment.
 */
export function createStorageAdapter(idbFactory?: IDBFactory): StorageAdapter {
  if (idbFactory || (typeof window !== 'undefined' && Boolean(window.indexedDB))) {
    return new IndexedDBStorageAdapter(idbFactory);
  }
  return new MemoryStorageAdapter();
}
