import 'server-only';
import { and, eq, lt, ne, or, isNull } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { dataStoreTables } from '@src/lib/db/schema/data-store';
import { syncTable, isSyncInProgress } from './sync-engine';

export interface ScheduleRunResult {
    processed: number;
    success: number;
    failed: number;
    skipped: number;
}

export async function runDueSchedules(
    options: {
        timeBudgetMs?: number;
        concurrency?: number;
    } = {}
): Promise<ScheduleRunResult> {
    const timeBudgetMs = options.timeBudgetMs ?? 50_000;
    const concurrency = options.concurrency ?? 2;
    const startTime = Date.now();

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Query due tables
    const candidates = await db
        .select()
        .from(dataStoreTables)
        .where(
            and(
                ne(dataStoreTables.schedule, 'manual'),
                ne(dataStoreTables.status, 'syncing'),
                or(
                    // Hourly
                    and(
                        eq(dataStoreTables.schedule, 'hourly'),
                        or(
                            isNull(dataStoreTables.lastSyncedAt),
                            lt(dataStoreTables.lastSyncedAt, oneHourAgo)
                        )
                    ),
                    // Daily
                    and(
                        eq(dataStoreTables.schedule, 'daily'),
                        or(
                            isNull(dataStoreTables.lastSyncedAt),
                            lt(dataStoreTables.lastSyncedAt, oneDayAgo)
                        )
                    ),
                    // Weekly
                    and(
                        eq(dataStoreTables.schedule, 'weekly'),
                        or(
                            isNull(dataStoreTables.lastSyncedAt),
                            lt(dataStoreTables.lastSyncedAt, oneWeekAgo)
                        )
                    )
                )
            )
        );

    const eligible = candidates.filter((t) => !isSyncInProgress(t.id));

    let processed = 0;
    let success = 0;
    let failed = 0;
    const skipped = candidates.length - eligible.length;

    // Worker pool with concurrency limit
    let cursor = 0;
    const workers = Array.from({ length: concurrency }, async () => {
        while (cursor < eligible.length) {
            if (Date.now() - startTime >= timeBudgetMs) {
                break;
            }

            const current = eligible[cursor++];
            if (!current) break;

            processed++;
            try {
                const res = await syncTable(current.id, { triggeredBy: 'schedule' });
                if (res.status === 'success') {
                    success++;
                } else {
                    failed++;
                }
            } catch {
                failed++;
            }
        }
    });

    await Promise.all(workers);

    return {
        processed,
        success,
        failed,
        skipped,
    };
}

