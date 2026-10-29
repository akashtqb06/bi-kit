import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from '@src/lib/db/paths';

export interface BackupHeartbeatInfo {
  found: boolean;
  status: 'ok' | 'error' | 'none';
  timestamp: string | null;
  ageHours: number | null;
  databaseBackup?: string | null;
  appDataBackup?: string | null;
  error?: string | null;
  warning: boolean;
}

export function getBackupHeartbeat(): BackupHeartbeatInfo {
  // Check common locations: app data dir, host backups dir, or env override
  const candidates = [
    process.env.BACKUP_HEARTBEAT_PATH,
    path.join(getDataDir(), 'backup-heartbeat.json'),
    path.join(process.cwd(), 'data', 'backup-heartbeat.json'),
    path.join(process.cwd(), 'backups', 'heartbeat.json'),
  ].filter(Boolean) as string[];

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        const timestamp = data.timestamp ? new Date(data.timestamp) : null;
        let ageHours: number | null = null;
        let warning = false;

        if (timestamp && !isNaN(timestamp.getTime())) {
          const ageMs = Math.max(0, Date.now() - timestamp.getTime());
          ageHours = Math.round((ageMs / (1000 * 60 * 60)) * 10) / 10;
          warning = ageHours > 36 || data.status !== 'ok';
        } else {
          warning = true;
        }

        return {
          found: true,
          status: data.status === 'ok' ? 'ok' : 'error',
          timestamp: data.timestamp ?? null,
          ageHours,
          databaseBackup: data.databaseBackup ?? null,
          appDataBackup: data.appDataBackup ?? null,
          error: data.error ?? null,
          warning,
        };
      }
    } catch {
      // Continue checking next candidate
    }
  }

  return {
    found: false,
    status: 'none',
    timestamp: null,
    ageHours: null,
    error: 'No backup recorded yet',
    warning: true,
  };
}

