import { db } from '@src/lib/db';
import { appSettings } from '@src/lib/db/schema';
import { getAllowedConnectorTypes, setAllowedConnectorTypes } from './allowed-connectors';
import { logAuditEvent } from '@src/lib/audit/audit-log';

export interface GeneralSettings {
    appName: string;
    allowRegistration: boolean;
    sessionLifetimeDays: number;
    allowedConnectorTypes: string[];
}

export interface EnvironmentInfo {
    publicUrl: string;
    networkPolicy: string;
    nodeEnv: string;
    secureCookies: boolean;
}

export async function getGeneralSettings(): Promise<GeneralSettings> {
    const rows = await db.select().from(appSettings);
    const map = new Map(rows.map((r) => [r.key, r.value]));

    const appName = typeof map.get('appName') === 'string' ? (map.get('appName') as string) : 'BI Kit';
    const allowRegistration = typeof map.get('allowRegistration') === 'boolean'
        ? (map.get('allowRegistration') as boolean)
        : true;
    const sessionLifetimeDays = typeof map.get('sessionLifetimeDays') === 'number'
        ? (map.get('sessionLifetimeDays') as number)
        : 30;

    const allowedConnectorTypes = await getAllowedConnectorTypes();

    return {
        appName,
        allowRegistration,
        sessionLifetimeDays,
        allowedConnectorTypes,
    };
}

export function getEnvironmentInfo(): EnvironmentInfo {
    const publicUrl = process.env.APP_URL || 'http://localhost:3000';
    const allowPrivate = process.env.ALLOW_PRIVATE_NETWORKS === 'true';
    const networkPolicy = allowPrivate
        ? 'Private network access permitted (ALLOW_PRIVATE_NETWORKS=true)'
        : 'SSRF Protection Active (RFC 1918 private & loopback addresses blocked)';

    return {
        publicUrl,
        networkPolicy,
        nodeEnv: process.env.NODE_ENV || 'development',
        secureCookies: publicUrl.toLowerCase().startsWith('https://'),
    };
}

export async function updateGeneralSettings(
    updates: Partial<GeneralSettings>,
    adminUserId: string
): Promise<GeneralSettings> {
    if (updates.appName !== undefined) {
        await db
            .insert(appSettings)
            .values({ key: 'appName', value: updates.appName })
            .onConflictDoUpdate({ target: appSettings.key, set: { value: updates.appName } });
    }

    if (updates.allowRegistration !== undefined) {
        await db
            .insert(appSettings)
            .values({ key: 'allowRegistration', value: updates.allowRegistration })
            .onConflictDoUpdate({ target: appSettings.key, set: { value: updates.allowRegistration } });
    }

    if (updates.sessionLifetimeDays !== undefined) {
        await db
            .insert(appSettings)
            .values({ key: 'sessionLifetimeDays', value: updates.sessionLifetimeDays })
            .onConflictDoUpdate({ target: appSettings.key, set: { value: updates.sessionLifetimeDays } });
    }

    if (updates.allowedConnectorTypes !== undefined) {
        await setAllowedConnectorTypes(updates.allowedConnectorTypes);
    }

    await logAuditEvent({
        userId: adminUserId,
        action: 'settings.update',
        details: updates as Record<string, unknown>,
    });

    return getGeneralSettings();
}
