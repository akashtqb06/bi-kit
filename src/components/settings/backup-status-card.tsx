import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArchiveIcon, AlertTriangleIcon, CheckCircle2Icon } from 'lucide-react';
import { getBackupHeartbeat } from '@src/lib/backup/heartbeat';
import { BackupNowButton } from './backup-now-button';

export function BackupStatusCard() {
  const heartbeat = getBackupHeartbeat();

  const isWarning = heartbeat.warning || (heartbeat.ageHours !== null && heartbeat.ageHours > 36);

  let formattedDate = 'Never';
  if (heartbeat.timestamp) {
    try {
      const d = new Date(heartbeat.timestamp);
      formattedDate = `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
    } catch {
      formattedDate = heartbeat.timestamp;
    }
  }

  return (
    <Card className="border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArchiveIcon className="size-5 text-muted-foreground" />
            <CardTitle>System Backups</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <BackupNowButton />
            {heartbeat.status === 'ok' && !isWarning ? (
              <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20">
                <CheckCircle2Icon className="size-3 mr-1" />
                Healthy
              </Badge>
            ) : (
              <Badge variant="destructive">
                <AlertTriangleIcon className="size-3 mr-1" />
                Attention Needed
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>
          Automated daily snapshots of PostgreSQL databases and file uploads.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground font-medium">Last backup:</span>
            <span className="font-semibold text-foreground">
              {formattedDate} {heartbeat.ageHours !== null ? `(${heartbeat.ageHours} hours ago)` : ''}
            </span>
          </div>

          {heartbeat.databaseBackup && (
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>Database Snapshot:</span>
              <span className="font-mono">{heartbeat.databaseBackup}</span>
            </div>
          )}

          {heartbeat.appDataBackup && (
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>Data Volume Archive:</span>
              <span className="font-mono">{heartbeat.appDataBackup}</span>
            </div>
          )}
        </div>

        {isWarning && (
          <Alert variant="destructive">
            <AlertTriangleIcon className="size-4" />
            <AlertTitle>Backup Warning</AlertTitle>
            <AlertDescription>
              {heartbeat.ageHours !== null && heartbeat.ageHours > 36
                ? `Last backup was over 36 hours ago (${heartbeat.ageHours} hours). Please verify that the Docker backup service is active.`
                : 'No successful backup heartbeat detected. Verify that the backup container is running and mounted to ./backups.'}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

