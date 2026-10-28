import { MongoClient, type MongoClientOptions, ObjectId, Decimal128, Binary, Long, type Document } from 'mongodb';
import type {
    Connector,
    ConnectorContext,
    QueryRequest,
    QueryExecutionOptions,
    QueryResult,
    SchemaSnapshot,
    TableSnapshot,
    ColumnSnapshot,
    ColumnDataType,
    TestResult,
} from '../../types';
import { ConnectorError } from '../../errors';
import { assertHostAllowed, assertMongoUriAllowed } from '../../network-guard';
import { validateMongoPipeline } from '@src/lib/query-engine/mongo/validate-pipeline';
import { formatMongoResults } from '@src/lib/query-engine/mongo/normalize';
import type { MongoConfig } from './definition';

export class MongoConnector implements Connector {
    public readonly config: MongoConfig;
    public readonly database: string;
    public readonly queryTimeoutMs: number;
    public readonly sampleSize: number;
    private client: MongoClient | null = null;
    private connectingPromise: Promise<MongoClient> | null = null;

    constructor(config: MongoConfig, _ctx?: ConnectorContext) {
        this.config = config;
        this.database = config.database;
        this.queryTimeoutMs = config.queryTimeoutMs || 30000;
        this.sampleSize = config.sampleSize || 1000;
    }

    private buildUriAndOptions(): { uri: string; options: MongoClientOptions } {
        const options: MongoClientOptions = {
            serverSelectionTimeoutMS: this.config.serverSelectionTimeoutMS || 10000,
            maxPoolSize: this.config.maxPoolSize || 5,
            readPreference: this.config.readPreference || 'secondaryPreferred',
            connectTimeoutMS: 10000,
        };

        if (this.config.mode === 'uri' && this.config.connectionString) {
            return {
                uri: this.config.connectionString,
                options,
            };
        }

        // Host mode
        const host = this.config.host || 'localhost';
        const port = this.config.port || 27017;
        let authPart = '';

        if (this.config.username) {
            const user = encodeURIComponent(this.config.username);
            const pass = this.config.password ? encodeURIComponent(this.config.password) : '';
            authPart = pass ? `${user}:${pass}@` : `${user}@`;
        }

        const params = new URLSearchParams();
        if (this.config.authSource) {
            params.set('authSource', this.config.authSource);
        }
        if (this.config.replicaSet) {
            params.set('replicaSet', this.config.replicaSet);
        }
        if (this.config.ssl) {
            params.set('tls', 'true');
            if (this.config.caCert) {
                options.tlsCAFile = this.config.caCert;
            }
        }

        const queryStr = params.toString();
        const uri = `mongodb://${authPart}${host}:${port}/${encodeURIComponent(this.database)}${queryStr ? `?${queryStr}` : ''}`;

        return { uri, options };
    }

    private async ensureConnected(): Promise<MongoClient> {
        if (this.client) {
            return this.client;
        }

        if (this.connectingPromise) {
            return this.connectingPromise;
        }

        this.connectingPromise = (async () => {
            // Network Guard Validation
            if (this.config.mode === 'uri' && this.config.connectionString) {
                await assertMongoUriAllowed(this.config.connectionString);
            } else {
                await assertHostAllowed(this.config.host || 'localhost', this.config.port || 27017);
            }

            const { uri, options } = this.buildUriAndOptions();
            const client = new MongoClient(uri, options);
            await client.connect();
            this.client = client;
            return client;
        })();

        try {
            return await this.connectingPromise;
        } finally {
            this.connectingPromise = null;
        }
    }

    async test(): Promise<TestResult> {
        const started = performance.now();
        const client = await this.ensureConnected();
        const db = client.db(this.database);

        // Ping command
        await db.admin().command({ ping: 1 });
        const latencyMs = Math.max(1, Math.round(performance.now() - started));

        // Get server version
        let serverVersion = 'unknown';
        try {
            const buildInfo = (await db.admin().command({ buildInfo: 1 })) as { version?: string };
            if (buildInfo.version) {
                serverVersion = buildInfo.version;
            }
        } catch {
            // ignore
        }

        const warnings: string[] = [];
        const isLoopback =
            this.config.host === 'localhost' ||
            this.config.host === '127.0.0.1' ||
            this.config.host === '::1';

        if (!this.config.ssl && !isLoopback && this.config.mode === 'host') {
            warnings.push('Connection is not encrypted. We strongly recommend enabling TLS in production.');
        }

        warnings.push('Ensure the MongoDB user has read-only privileges (e.g. "read" or "readAnyDatabase" role).');

        return {
            ok: true,
            latencyMs,
            serverVersion,
            message: `Connected successfully to MongoDB ${serverVersion} (${latencyMs}ms)`,
            warnings,
        };
    }

    async introspect(opts?: { schemas?: string[]; sampleSize?: number; signal?: AbortSignal }): Promise<SchemaSnapshot> {
        const client = await this.ensureConnected();
        const db = client.db(this.database);

        const collectionsInfo = await db.listCollections().toArray();
        const tables: TableSnapshot[] = [];
        const effectiveSampleSize = (opts?.sampleSize && opts.sampleSize > 0) ? opts.sampleSize : this.sampleSize;

        for (const info of collectionsInfo) {
            const name = info.name;
            // Skip system collections
            if (name.startsWith('system.')) {
                continue;
            }

            const kind: TableSnapshot['kind'] = info.type === 'view' ? 'view' : 'collection';
            const coll = db.collection(name);

            // Document count estimate
            let rowCountEstimate: number | undefined;
            try {
                rowCountEstimate = await coll.estimatedDocumentCount();
            } catch {
                // ignore
            }

            // Sample documents to infer fields
            let sampleDocs: Record<string, unknown>[] = [];
            try {
                sampleDocs = (await coll
                    .aggregate([{ $sample: { size: effectiveSampleSize } }], {
                        maxTimeMS: this.queryTimeoutMs,
                        allowDiskUse: false,
                    })
                    .toArray()) as Record<string, unknown>[];
            } catch {
                // If collection is empty or aggregate fails, fallback to find
                try {
                    sampleDocs = (await coll.find({}).limit(50).toArray()) as Record<string, unknown>[];
                } catch {
                    sampleDocs = [];
                }
            }

            // Infer fields from sample documents
            const columns = this.inferColumnsFromDocuments(sampleDocs);

            tables.push({
                name,
                kind,
                rowCountEstimate,
                columns,
            });
        }

        return { tables };
    }

    private inferColumnsFromDocuments(docs: Record<string, unknown>[]): ColumnSnapshot[] {
        if (docs.length === 0) {
            return [
                {
                    name: '_id',
                    type: 'id',
                    nativeType: 'ObjectId',
                    nullable: false,
                    isPrimaryKey: true,
                },
            ];
        }

        // Map of path -> Set of detected type strings
        const pathTypeMap = new Map<string, Set<string>>();

        const visit = (obj: unknown, prefix = '', depth = 1) => {
            if (obj === null || obj === undefined || depth > 3) return;

            if (typeof obj === 'object') {
                if (obj instanceof ObjectId || obj instanceof Date || obj instanceof Decimal128 || obj instanceof Binary || Buffer.isBuffer(obj)) {
                    const t = this.detectBsonType(obj);
                    if (!pathTypeMap.has(prefix)) pathTypeMap.set(prefix, new Set());
                    pathTypeMap.get(prefix)!.add(t);
                    return;
                }

                if (Array.isArray(obj)) {
                    if (!pathTypeMap.has(prefix)) pathTypeMap.set(prefix, new Set());
                    pathTypeMap.get(prefix)!.add('json');
                    return;
                }

                // Plain document: recurse into keys
                for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
                    const currentPath = prefix ? `${prefix}.${key}` : key;
                    if (val === null || val === undefined) {
                        continue;
                    }
                    if (typeof val === 'object' && !(val instanceof ObjectId) && !(val instanceof Date) && !(val instanceof Decimal128) && !Array.isArray(val)) {
                        visit(val, currentPath, depth + 1);
                    } else {
                        const t = this.detectBsonType(val);
                        if (!pathTypeMap.has(currentPath)) pathTypeMap.set(currentPath, new Set());
                        pathTypeMap.get(currentPath)!.add(t);
                    }
                }
            } else {
                const t = this.detectBsonType(obj);
                if (!pathTypeMap.has(prefix)) pathTypeMap.set(prefix, new Set());
                pathTypeMap.get(prefix)!.add(t);
            }
        };

        for (const doc of docs) {
            visit(doc);
        }

        const columns: ColumnSnapshot[] = [];
        // Ensure _id is first if present
        if (pathTypeMap.has('_id')) {
            columns.push({
                name: '_id',
                type: 'id',
                nativeType: 'ObjectId',
                nullable: false,
                isPrimaryKey: true,
            });
            pathTypeMap.delete('_id');
        }

        for (const [colName, types] of pathTypeMap.entries()) {
            let finalType: ColumnDataType = 'text';
            let nativeType = 'string';

            if (types.size === 1) {
                const only = Array.from(types)[0];
                finalType = only as ColumnDataType;
                nativeType = only;
            } else if (types.size > 1) {
                // If mixed number types (e.g. number and Decimal128), it's number
                const nonNulls = Array.from(types).filter((t) => t !== 'null');
                if (nonNulls.every((t) => t === 'number')) {
                    finalType = 'number';
                    nativeType = 'number';
                } else {
                    finalType = 'text';
                    nativeType = 'mixed';
                }
            }

            columns.push({
                name: colName,
                type: finalType,
                nativeType,
                nullable: true,
            });
        }

        return columns;
    }

    private detectBsonType(val: unknown): ColumnDataType {
        if (val instanceof ObjectId) return 'id';
        if (val instanceof Date) return 'date';
        if (val instanceof Decimal128 || val instanceof Long || typeof val === 'number') return 'number';
        if (typeof val === 'boolean') return 'boolean';
        if (val instanceof Binary || Buffer.isBuffer(val)) return 'binary';
        if (Array.isArray(val) || (typeof val === 'object' && val !== null)) return 'json';
        return 'text';
    }

    async run(request: QueryRequest, opts?: QueryExecutionOptions): Promise<QueryResult> {
        if (request.kind !== 'mongo') {
            throw new ConnectorError(
                'MongoDB connector only supports MongoDB aggregation pipelines ("mongo" query request kind).',
                'UNSUPPORTED_OPERATION'
            );
        }

        const collectionName = request.collection;
        if (!collectionName) {
            throw new ConnectorError('A target collection must be specified.', 'INVALID_REQUEST');
        }

        // Validate pipeline security
        validateMongoPipeline(request.pipeline);

        const limit = Math.min(10000, opts?.limit ?? 1000);
        const timeoutMs = opts?.timeoutMs ?? this.queryTimeoutMs;

        // Clone pipeline and append $limit(limit + 1) to detect truncation
        const executionPipeline = [...request.pipeline, { $limit: limit + 1 }];

        const client = await this.ensureConnected();
        const db = client.db(this.database);
        const coll = db.collection(collectionName);

        const started = Date.now();
        const cursor = coll.aggregate(executionPipeline as Document[], {
            maxTimeMS: timeoutMs,
            allowDiskUse: false,
        });

        // Abort support
        if (opts?.signal) {
            opts.signal.addEventListener(
                'abort',
                () => {
                    void cursor.close();
                },
                { once: true }
            );
        }

        let documents: Record<string, unknown>[];
        try {
            documents = (await cursor.toArray()) as Record<string, unknown>[];
        } catch (err: unknown) {
            const error = err as Error & { code?: number };
            if (error.code === 50 || error.name === 'MongoTimeoutError' || (error.message && error.message.includes('time limit exceeded'))) {
                throw new ConnectorError(`MongoDB query execution exceeded deadline of ${timeoutMs}ms.`, 'QUERY_TIMEOUT');
            }
            throw new ConnectorError(`MongoDB execution failed: ${error.message || String(err)}`, 'EXEC_FAILED');
        }

        const truncated = documents.length > limit;
        if (truncated) {
            documents.pop();
        }

        const durationMs = Math.max(1, Date.now() - started);
        const { columns, rows } = formatMongoResults(documents);

        return {
            columns,
            rows,
            rowCount: rows.length,
            truncated,
            durationMs,
        };
    }

    async close(): Promise<void> {
        if (this.client) {
            try {
                await this.client.close();
            } finally {
                this.client = null;
            }
        }
    }
}
