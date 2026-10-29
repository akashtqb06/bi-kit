import type { CreateTransactionDTO } from '@src/lib/finance/contract';

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface QueuedTransaction {
  id: string;
  clientRequestId: string;
  data: CreateTransactionDTO;
  createdAt: number; // Unix timestamp in milliseconds for FIFO order
  status: SyncStatus;
  retryCount: number;
  lastError: string | null;
}

export interface SyncResult {
  total: number;
  synced: number;
  failed: number;
  remaining: number;
  errors: Array<{ id: string; error: string }>;
}

export interface PWAInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PWAInstallState {
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  visitCount: number;
  shouldShowPrompt: boolean;
}

export interface SyncState {
  pendingCount: number;
  isSyncing: boolean;
  isOnline: boolean;
  lastSyncedAt: number | null;
}
