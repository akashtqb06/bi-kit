import { db } from '@src/lib/db';
import { appSettings } from '@src/lib/db/schema';
import { eq } from 'drizzle-orm';
import { listConnectorDefinitions } from '@src/lib/connectors/registry';

export const ALLOWED_CONNECTORS_KEY = 'allowedConnectorTypes';

export function getDefaultAllowedConnectors(): string[] {
    return listConnectorDefinitions().map((d) => d.type);
}

export async function getAllowedConnectorTypes(): Promise<string[]> {
    try {
        const [row] = await db
            .select()
            .from(appSettings)
            .where(eq(appSettings.key, ALLOWED_CONNECTORS_KEY))
            .limit(1);

        if (row && Array.isArray(row.value)) {
            return (row.value as unknown[]).filter((v): v is string => typeof v === 'string');
        }
    } catch (err) {
        console.error('[Settings] Failed to read allowedConnectorTypes:', err);
    }
    return getDefaultAllowedConnectors();
}

export async function setAllowedConnectorTypes(types: string[]): Promise<void> {
    const validTypes = getDefaultAllowedConnectors();
    const filtered = types.filter((t) => validTypes.includes(t));

    await db
        .insert(appSettings)
        .values({
            key: ALLOWED_CONNECTORS_KEY,
            value: filtered,
        })
        .onConflictDoUpdate({
            target: appSettings.key,
            set: {
                value: filtered,
            },
        });
}

export async function isConnectorTypeAllowed(type: string): Promise<boolean> {
    const allowed = await getAllowedConnectorTypes();
    return allowed.includes(type);
}
