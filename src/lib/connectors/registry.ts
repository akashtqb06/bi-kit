import type { ConnectorDefinition, PublicConnectorDefinition } from './types';
import { sqliteDefinition } from './drivers/sqlite';
import { csvDefinition } from './drivers/csv';
import { excelDefinition } from './drivers/excel';
import { postgresDefinition } from './drivers/postgres';
import { mysqlDefinition } from './drivers/mysql';
import { mssqlDefinition } from './drivers/mssql';
import { mongoDefinition } from './drivers/mongodb';

class ConnectorRegistry {
    private definitions = new Map<string, ConnectorDefinition>();

    constructor() {
        this.register(sqliteDefinition as ConnectorDefinition);
        this.register(csvDefinition as ConnectorDefinition);
        this.register(excelDefinition as ConnectorDefinition);
        this.register(postgresDefinition as ConnectorDefinition);
        this.register(mysqlDefinition as ConnectorDefinition);
        this.register(mssqlDefinition as ConnectorDefinition);
        this.register(mongoDefinition as ConnectorDefinition);
    }

    register(definition: ConnectorDefinition): void {
        this.definitions.set(definition.type.toLowerCase(), definition);
    }

    get(type: string): ConnectorDefinition | undefined {
        return this.definitions.get(type.toLowerCase());
    }

    list(): ConnectorDefinition[] {
        return Array.from(this.definitions.values());
    }

    listPublic(): PublicConnectorDefinition[] {
        return this.list().map((def) => ({
            type: def.type,
            label: def.label,
            category: def.category,
            description: def.description,
            icon: def.icon,
            fields: def.fields,
            capabilities: def.capabilities,
        }));
    }
}

// Global registry instance surviving hot reloads
const globalRegistry = (globalThis as unknown as { __connector_registry?: ConnectorRegistry });
export const connectorRegistry = (globalRegistry.__connector_registry ??= new ConnectorRegistry());

export function registerConnector(definition: ConnectorDefinition): void {
    connectorRegistry.register(definition);
}

export function getConnectorDefinition(type: string): ConnectorDefinition | undefined {
    return connectorRegistry.get(type);
}

export function listConnectorDefinitions(): ConnectorDefinition[] {
    return connectorRegistry.list();
}

export function listPublicConnectorDefinitions(): PublicConnectorDefinition[] {
    return connectorRegistry.listPublic();
}
