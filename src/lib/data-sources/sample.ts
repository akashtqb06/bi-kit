import { existsSync } from 'node:fs';
import { listDataSources, type DataSourcePublic } from './service';
import { SAMPLE_DB_PATH } from '@src/lib/db/paths';
import { resetConnection } from '@src/lib/db';
import { seedDemoDatabase } from '../../../scripts/seed/demo-data';
import { seedSampleWorkbook } from '../../../scripts/seed/sample-workbook';

const sampleName = 'Demo Store';

export async function ensureSampleDataSource(user?: { id: string; role: string }): Promise<{ source: DataSourcePublic; created: boolean }> {
    const created = !existsSync(SAMPLE_DB_PATH);
    if (created) seedDemoDatabase();
    await seedSampleWorkbook(user?.id);
    resetConnection();

    const seeded = listDataSources(user).find(
        (source) => source.type === 'sqlite' && (source.slug === 'demo-store' || source.slug === `demo-store-${user?.id}` || source.name === sampleName)
    );
    if (!seeded || !existsSync(SAMPLE_DB_PATH)) {
        throw new Error('The sample data seed did not create a usable SQLite source.');
    }
    return { source: seeded, created };
}
