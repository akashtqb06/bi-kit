import fs from 'node:fs';
import path from 'node:path';
import { db } from '@src/lib/db';
import { dataSources } from '@src/lib/db/schema';
import { eq } from 'drizzle-orm';
import { DATA_DIR } from '@src/lib/db/paths';

async function main() {
    console.log('Migrating data sources to managed connector configuration...');
    const allSources = await db.select().from(dataSources);

    let migrated = 0;
    for (const source of allSources) {
        let dirty = false;
        let config: Record<string, unknown> = {};
        if (typeof source.config === 'object' && source.config !== null) {
            config = { ...(source.config as Record<string, unknown>) };
        } else if (typeof source.config === 'string') {
            try {
                config = JSON.parse(source.config);
            } catch {
                config = {};
            }
        }

        const updates: Partial<typeof dataSources.$inferInsert> = {
            updatedAt: new Date(),
        };

        if (!source.status) {
            updates.status = 'unknown';
            dirty = true;
        }

        if (source.type === 'sqlite') {
            const rawPath = (config.path || config.filePath) as string | undefined;
            if (rawPath && !config.managedPath && !config.serverPath) {
                const resolvedOldPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
                if (fs.existsSync(resolvedOldPath)) {
                    const managedRel = `files/${source.id}/data.db`;
                    const managedAbs = path.join(DATA_DIR, managedRel);
                    fs.mkdirSync(path.dirname(managedAbs), { recursive: true });
                    fs.copyFileSync(resolvedOldPath, managedAbs);
                    const stat = fs.statSync(managedAbs);

                    config = {
                        managedPath: managedRel,
                        fileName: (config.fileName as string) || path.basename(resolvedOldPath),
                        size: stat.size,
                        importedAt: (config.importedAt as string) || new Date().toISOString(),
                    };
                    updates.config = config;
                    updates.status = 'ok';
                    dirty = true;
                } else {
                    updates.status = 'error';
                    updates.lastError = `Original SQLite file not found at ${rawPath}`;
                    dirty = true;
                }
            }
        } else if (source.type === 'csv') {
            const rawPath = (config.filePath || config.path) as string | undefined;
            if (rawPath && !config.managedPath) {
                const resolvedOldPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
                if (fs.existsSync(resolvedOldPath)) {
                    const managedRel = `files/${source.id}/data.db`;
                    const managedAbs = path.join(DATA_DIR, managedRel);
                    fs.mkdirSync(path.dirname(managedAbs), { recursive: true });
                    fs.copyFileSync(resolvedOldPath, managedAbs);
                    const stat = fs.statSync(managedAbs);

                    config = {
                        ...config,
                        managedPath: managedRel,
                        fileName: (config.fileName as string) || path.basename(resolvedOldPath),
                        size: stat.size,
                        importedAt: (config.importedAt as string) || new Date().toISOString(),
                    };
                    delete config.path;
                    delete config.filePath;
                    updates.config = config;
                    updates.status = 'ok';
                    dirty = true;
                }
            }
        }

        if (dirty) {
            await db.update(dataSources)
                .set(updates)
                .where(eq(dataSources.id, source.id));
            migrated++;
            console.log(`Migrated data source ${source.name} (${source.id})`);
        }
    }

    console.log(`Migration complete. Updated ${migrated} of ${allSources.length} data sources.`);
}

main().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
