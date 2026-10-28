import { db } from '@src/lib/db';
import { appSettings } from '@src/lib/db/schema';
import { eq } from 'drizzle-orm';
import { listConnectorDefinitions } from '@src/lib/connectors/registry';

export const ALLOWED_CONNECTORS_KEY = 'allowedConnectorTypes';

export function getDefaultAllowedConnectors(): string[] {
    return listConnectorDefinitions().map((d) => d.type);
}

export function getAllowedConnectorTypes(): string[] {
    try {
        const row = db
            .select()
            .from(appSettings)
            .where(eq(appSettings.key, ALLOWED_CONNECTORS_KEY))
            .get();

        if (row && Array.isArray(row.value)) {
            return (row.value as unknown[]).filter((v): v is string => typeof v === 'string');
        }
    } catch (err) {
        console.error('[Settings] Failed to read allowedConnectorTypes:', err);
    }
    return getDefaultAllowedConnectors();
}

export function setAllowedConnectorTypes(types: string[]): void {
    const validTypes = getDefaultAllowedConnectors();
    const filtered = types.filter((t) => validTypes.includes(t));

    db.insert(appSettings)
        .values({
            key: ALLOWED_CONNECTORS_KEY,
            value: filtered,
        })
        .onConflictDoUpdate({
            target: appSettings.key,
            set: {
                value: filtered,
            },
        })
        .run();
}

export function isConnectorTypeAllowed(type: string): boolean {
    const allowed = getAllowedConnectorTypes();
    return allowed.includes(type);
}

