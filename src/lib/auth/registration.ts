import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { appSettings } from '@src/lib/db/schema';

export async function isRegistrationAllowed(): Promise<boolean> {
    const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, 'allowRegistration')).limit(1);
    return setting?.value === true;
}
