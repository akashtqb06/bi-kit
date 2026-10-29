import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { appSettings } from '@src/lib/db/schema';

export async function isRegistrationAllowed(): Promise<boolean> {
    const envAllow = process.env.ALLOW_REGISTRATION?.trim().toLowerCase();
    if (envAllow === 'false' || envAllow === '0') {
        return false;
    }
    if (envAllow === 'true' || envAllow === '1') {
        return true;
    }

    const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, 'allowRegistration')).limit(1);
    return setting?.value === true;
}
