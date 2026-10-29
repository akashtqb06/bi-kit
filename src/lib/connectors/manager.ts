import crypto from 'node:crypto';
import type { DataSource } from '@src/lib/db/schema';
import { ConnectorError } from './errors';
import type { Connector, QueryRequest, QueryExecutionOptions, QueryResult, TestResult } from './types';
import { getConnectorDefinition } from './registry';
import { decryptSecretFields } from './secrets';

interface CachedConnectorEntry {
    connector: Connector;
    key: string;
    dataSourceId: string;
    lastUsedAt: number;
    idleTimer: NodeJS.Timeout;
}

interface QueuedTask {
    resolve: () => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
}

interface SourceLimiter {
    activeCount: number;
    queue: QueuedTask[];
}

interface CachedResultEntry {
    result: QueryResult;
    expiresAt: number;
}

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes idle timeout
const MAX_CONCURRENCY = parseInt(process.env.CONNECTOR_MAX_CONCURRENCY || '4', 10);
const MAX_QUEUE = parseInt(process.env.CONNECTOR_MAX_QUEUE || '50', 10);
const QUEUE_TIMEOUT_MS = parseInt(process.env.CONNECTOR_QUEUE_TIMEOUT_MS || '15000', 10);
const RESULT_CACHE_TTL_MS = parseInt(process.env.CONNECTOR_CACHE_TTL_MS || '60000', 10);
const MAX_CACHE_ENTRIES = 500;

class ConnectorManager {
    private connectorCache = new Map<string, CachedConnectorEntry>();
    private limiters = new Map<string, SourceLimiter>();
    private resultCache = new Map<string, CachedResultEntry>();

    constructor() {
        if (typeof process !== 'undefined') {
            const cleanup = () => {
                void this.closeAll();
            };
            process.on('beforeExit', cleanup);
            process.on('SIGINT', cleanup);
            process.on('SIGTERM', cleanup);
        }
    }

    private hash(val: string): string {
        return crypto.createHash('sha256').update(val).digest('hex').slice(0, 16);
    }

    /**
     * Get or create a Connector instance for a given DataSource.
     */
    async getConnector(
        dataSource: Pick<DataSource, 'id' | 'type' | 'config'>
    ): Promise<Connector> {
        const definition = getConnectorDefinition(dataSource.type);
        if (!definition) {
            throw new ConnectorError(
                `Unsupported data source type: "${dataSource.type}".`,
                'UNKNOWN_CONNECTOR_TYPE'
            );
        }

        const configStr = typeof dataSource.config === 'string' ? dataSource.config : JSON.stringify(dataSource.config);
        const cacheKey = `${dataSource.id}:${this.hash(configStr)}`;
        const existing = this.connectorCache.get(cacheKey);

        if (existing) {
            clearTimeout(existing.idleTimer);
            existing.lastUsedAt = Date.now();
            existing.idleTimer = setTimeout(() => {
                void this.evictConnector(cacheKey);
            }, IDLE_TIMEOUT_MS);
            return existing.connector;
        }

        // Parse and decrypt config
        let rawJson: Record<string, unknown>;
        if (typeof dataSource.config === 'string') {
            try {
                rawJson = JSON.parse(dataSource.config) as Record<string, unknown>;
            } catch {
                throw new ConnectorError('DataSource config is not valid JSON.', 'INVALID_CONFIG_JSON');
            }
        } else if (dataSource.config && typeof dataSource.config === 'object') {
            rawJson = dataSource.config as Record<string, unknown>;
        } else {
            rawJson = {};
        }

        const decryptedConfig = decryptSecretFields(definition, rawJson);
        const validatedConfig = definition.configSchema.parse(decryptedConfig);

        const connector = definition.create(validatedConfig, {
            dataSourceId: dataSource.id,
        });

        const entry: CachedConnectorEntry = {
            connector,
            key: cacheKey,
            dataSourceId: dataSource.id,
            lastUsedAt: Date.now(),
            idleTimer: setTimeout(() => {
                void this.evictConnector(cacheKey);
            }, IDLE_TIMEOUT_MS),
        };

        this.connectorCache.set(cacheKey, entry);
        return connector;
    }

    private async evictConnector(key: string): Promise<void> {
        const entry = this.connectorCache.get(key);
        if (entry) {
            clearTimeout(entry.idleTimer);
            this.connectorCache.delete(key);
            try {
                await entry.connector.close();
            } catch {
                // ignore
            }
        }
    }

    /**
     * Invalidate and close all cached connections for a given dataSourceId.
     */
    async invalidate(dataSourceId: string): Promise<void> {
        const keysToEvict: string[] = [];
        for (const [key, entry] of this.connectorCache) {
            if (entry.dataSourceId === dataSourceId) {
                keysToEvict.push(key);
            }
        }
        await Promise.all(keysToEvict.map((key) => this.evictConnector(key)));

        // Clear result cache for this source
        const resultPrefix = `${dataSourceId}:`;
        for (const cacheKey of this.resultCache.keys()) {
            if (cacheKey.startsWith(resultPrefix)) {
                this.resultCache.delete(cacheKey);
            }
        }
    }

    /**
     * Close all cached connectors across all sources.
     */
    async closeAll(): Promise<void> {
        const keys = Array.from(this.connectorCache.keys());
        await Promise.all(keys.map((k) => this.evictConnector(k)));
        this.resultCache.clear();
    }

    /**
     * Concurrency limiter slot acquisition.
     */
    private async acquireSlot(dataSourceId: string): Promise<() => void> {
        let limiter = this.limiters.get(dataSourceId);
        if (!limiter) {
            limiter = { activeCount: 0, queue: [] };
            this.limiters.set(dataSourceId, limiter);
        }

        if (limiter.activeCount < MAX_CONCURRENCY) {
            limiter.activeCount++;
            return () => this.releaseSlot(dataSourceId);
        }

        if (limiter.queue.length >= MAX_QUEUE) {
            throw new ConnectorError(
                `Too many concurrent queries for data source "${dataSourceId}". Queue limit reached.`,
                'CONCURRENCY_QUEUE_FULL'
            );
        }

        return new Promise<() => void>((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                // Remove from queue
                const idx = limiter!.queue.findIndex((q) => q.timer === timer);
                if (idx !== -1) limiter!.queue.splice(idx, 1);
                reject(
                    new ConnectorError(
                        'Query wait time exceeded concurrency queue timeout limit.',
                        'QUEUE_TIMEOUT'
                    )
                );
            }, QUEUE_TIMEOUT_MS);

            limiter!.queue.push({
                resolve: () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    resolve(() => this.releaseSlot(dataSourceId));
                },
                reject: (err: Error) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    reject(err);
                },
                timer,
            });
        });
    }

    private releaseSlot(dataSourceId: string): void {
        const limiter = this.limiters.get(dataSourceId);
        if (!limiter) return;

        limiter.activeCount--;
        if (limiter.queue.length > 0) {
            const next = limiter.queue.shift();
            if (next) {
                limiter.activeCount++;
                next.resolve();
            }
        }
    }

    /**
     * Run a query through the manager with caching, concurrency limiting, and timeout.
     */
    async runQuery(
        dataSource: Pick<DataSource, 'id' | 'type' | 'config'>,
        request: QueryRequest,
        opts?: QueryExecutionOptions & { refresh?: boolean }
    ): Promise<QueryResult> {
        const cacheKey = `${dataSource.id}:${this.hash(JSON.stringify(request))}:${opts?.limit ?? ''}:${opts?.offset ?? ''}`;

        // 1. Check in-memory result cache
        if (!opts?.refresh) {
            const cached = this.resultCache.get(cacheKey);
            if (cached && cached.expiresAt > Date.now()) {
                return cached.result;
            }
        }

        // 2. Acquire concurrency slot
        const release = await this.acquireSlot(dataSource.id);

        try {
            const connector = await this.getConnector(dataSource);
            const result = await connector.run(request, opts);

            // 3. Populate LRU cache
            if (this.resultCache.size >= MAX_CACHE_ENTRIES) {
                const oldestKey = this.resultCache.keys().next().value;
                if (oldestKey) this.resultCache.delete(oldestKey);
            }

            this.resultCache.set(cacheKey, {
                result,
                expiresAt: Date.now() + RESULT_CACHE_TTL_MS,
            });

            return result;
        } finally {
            release();
        }
    }

    /**
     * Test an unsaved connector configuration.
     */
    async testConfig(type: string, rawConfig: Record<string, unknown>): Promise<TestResult> {
        const definition = getConnectorDefinition(type);
        if (!definition) {
            throw new ConnectorError(`Unknown connector type: "${type}".`, 'UNKNOWN_TYPE');
        }

        const validated = definition.configSchema.parse(rawConfig);
        const connector = definition.create(validated);
        try {
            return await connector.test();
        } finally {
            await connector.close();
        }
    }
}

// Global manager instance
const globalManager = (globalThis as unknown as { __connector_manager?: ConnectorManager });
export const connectorManager = (globalManager.__connector_manager ??= new ConnectorManager());

export function getConnector(
    dataSource: Pick<DataSource, 'id' | 'type' | 'config'>
): Promise<Connector> {
    return connectorManager.getConnector(dataSource);
}

export function invalidateConnector(dataSourceId: string): Promise<void> {
    return connectorManager.invalidate(dataSourceId);
}

export function runQuery(
    dataSource: Pick<DataSource, 'id' | 'type' | 'config'>,
    request: QueryRequest,
    opts?: QueryExecutionOptions & { refresh?: boolean }
): Promise<QueryResult> {
    return connectorManager.runQuery(dataSource, request, opts);
}

export function testConnectorConfig(
    type: string,
    config: Record<string, unknown>
): Promise<TestResult> {
    return connectorManager.testConfig(type, config);
}
