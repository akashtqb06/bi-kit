import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { compile, CompileError } from '@src/lib/query-engine/compiler';
import { inlineParams } from '@src/lib/query-engine/inline-params';
import type { QueryStep, QueryDefinition, FilterOp, AggFn } from '@src/lib/query-engine/definition';
import type { SchemaInfo } from '@src/lib/connectors/types';
import type { DataSourcePublic } from '@src/lib/data-sources/service';
import type { QueryPublic } from '@src/lib/queries/service';
import { getAvailableColumnsForStep } from '@src/lib/query-engine/infer-columns';
import { toast } from 'sonner';

export type ClientQueryStep = QueryStep & { _id: string };

export interface ClientQueryDefinition {
    source: { table: string };
    steps: ClientQueryStep[];
}

export interface QueryResultData {
    columns: { name: string; type: string }[];
    rows: (string | number | bigint | Buffer | null)[][];
    rowCount: number;
    totalRows?: number;
    page?: number;
    pageSize?: number;
    truncated: boolean;
    durationMs: number;
    sql: string;
}

export interface QueryEditorState {
    queryId: string;
    workbookId: string;
    queryName: string;
    dataSourceId: string;
    mode: 'builder' | 'sql';
    definition: ClientQueryDefinition;
    sql: string;
    compiledSql: string | null;
    compileError: string | null;

    schema: SchemaInfo | null;
    dataSources: DataSourcePublic[];
    isLoadingSchema: boolean;

    isSaving: boolean;
    isDirty: boolean;
    lastSavedAt: Date | null;

    results: QueryResultData | null;
    isRunning: boolean;
    runError: string | null;
    lastRunAt: Date | null;

    page: number;
    pageSize: number;
    totalRows: number;

    sqlInsertHandler: ((text: string) => void) | null;

    // Actions
    init: (query: QueryPublic, dataSources: DataSourcePublic[]) => Promise<void>;
    loadSchema: (dataSourceId: string) => Promise<void>;
    setQueryName: (name: string) => void;
    setDataSourceId: (id: string) => Promise<void>;
    setMode: (mode: 'builder' | 'sql') => void;
    setSql: (sql: string) => void;
    setSourceTable: (table: string) => void;
    addStep: (type: QueryStep['type'] | 'convert') => void;
    updateStep: (index: number, step: Partial<QueryStep>) => void;
    removeStep: (index: number) => void;
    reorderSteps: (oldIndex: number, newIndex: number) => void;
    convertToSql: () => void;
    switchToSqlMode: () => Promise<void>;
    switchToBuilderMode: () => Promise<void>;
    registerSqlInsertHandler: (fn: ((text: string) => void) | null) => void;
    insertSqlText: (text: string) => void;
    recompile: () => void;
    setPage: (page: number) => Promise<void>;
    clearResults: () => void;
    debounceAutoRun: () => void;
    runQuery: (pageOverride?: number, isAutoRun?: boolean, signal?: AbortSignal) => Promise<void>;
    saveQuery: () => Promise<void>;
}

export function cleanDefinitionForCompile(def: ClientQueryDefinition): QueryDefinition {
    return {
        source: def.source,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        steps: def.steps.map(({ _id, ...rest }) => rest as QueryStep),
    };
}

function parseStoredDefinition(raw: string): ClientQueryDefinition {
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            if (parsed.source && typeof parsed.source.table === 'string') {
                const steps = Array.isArray(parsed.steps)
                    ? parsed.steps.map((s: QueryStep) => ({
                          ...s,
                          _id: (s as ClientQueryStep)._id || nanoid(),
                      }))
                    : [];
                return {
                    source: { table: parsed.source.table },
                    steps,
                };
            }
        }
    } catch {
        // ignore
    }
    return {
        source: { table: '' },
        steps: [],
    };
}

let autoRunTimer: NodeJS.Timeout | null = null;

export const useQueryEditorStore = create<QueryEditorState>((set, get) => ({
    queryId: '',
    workbookId: '',
    queryName: '',
    dataSourceId: '',
    mode: 'builder',
    definition: { source: { table: '' }, steps: [] },
    sql: '',
    compiledSql: null,
    compileError: null,

    schema: null,
    dataSources: [],
    isLoadingSchema: false,

    isSaving: false,
    isDirty: false,
    lastSavedAt: null,

    results: null,
    isRunning: false,
    runError: null,
    lastRunAt: null,

    page: 1,
    pageSize: 100,
    totalRows: 0,

    sqlInsertHandler: null,

    init: async (query, dataSources) => {
        const def = parseStoredDefinition(query.definition);
        set({
            queryId: query.id,
            workbookId: query.workbookId,
            queryName: query.name,
            dataSourceId: query.dataSourceId,
            mode: query.mode,
            definition: def,
            sql: query.sql || '',
            dataSources,
            isDirty: false,
            results: null,
            runError: null,
            lastRunAt: null,
            page: 1,
            totalRows: 0,
        });

        if (query.dataSourceId) {
            await get().loadSchema(query.dataSourceId);
        }
    },

    loadSchema: async (dataSourceId: string) => {
        if (!dataSourceId) return;
        set({ isLoadingSchema: true });
        try {
            const res = await fetch(`/api/data-sources/${dataSourceId}/schema`);
            const json = (await res.json()) as { data?: SchemaInfo; error?: string };
            if (res.ok && json.data) {
                set({ schema: json.data });
                get().recompile();
            } else {
                set({ schema: null, compileError: json.error || 'Failed to load schema' });
            }
        } catch {
            set({ schema: null, compileError: 'Failed to fetch schema' });
        } finally {
            set({ isLoadingSchema: false });
        }
    },

    setQueryName: (name: string) => {
        set({ queryName: name, isDirty: true });
    },

    setDataSourceId: async (id: string) => {
        set({ dataSourceId: id, isDirty: true });
        await get().loadSchema(id);
    },

    setMode: (mode: 'builder' | 'sql') => {
        set({ mode, isDirty: true });
    },

    setSql: (sql: string) => {
        set({ sql, isDirty: true });
    },

    setSourceTable: (table: string) => {
        const { definition } = get();
        const updated: ClientQueryDefinition = {
            ...definition,
            source: { table },
        };
        set({ definition: updated, isDirty: true, page: 1 });
        get().recompile();
        get().debounceAutoRun();
    },

    debounceAutoRun: () => {
        if (autoRunTimer) clearTimeout(autoRunTimer);
        autoRunTimer = setTimeout(() => {
            void get().runQuery(1, true);
        }, 400);
    },

    setPage: async (page: number) => {
        set({ page });
        await get().runQuery(page);
    },

    clearResults: () => {
        set({ results: null, runError: null, lastRunAt: null, totalRows: 0, page: 1 });
    },

    addStep: (type: QueryStep['type'] | 'convert') => {
        const { definition, schema } = get();
        const currentCols = getAvailableColumnsForStep(
            cleanDefinitionForCompile(definition),
            definition.steps.length,
            schema
        );
        const firstCol = currentCols[0]?.name || 'id';

        let newStep: ClientQueryStep;

        switch (type) {
            case 'filter':
                newStep = {
                    _id: nanoid(),
                    type: 'filter',
                    conditions: {
                        logic: 'and',
                        items: [{ column: firstCol, op: '=' as FilterOp, value: '' }],
                    },
                };
                break;

            case 'summarize':
                newStep = {
                    _id: nanoid(),
                    type: 'summarize',
                    groupBy: [],
                    aggregates: [
                        {
                            fn: 'count' as AggFn,
                            column: firstCol,
                            alias: `${firstCol}_count`,
                        },
                    ],
                };
                break;

            case 'join': {
                const otherTable =
                    schema?.tables.find((t) => t.name.toLowerCase() !== definition.source.table.toLowerCase())?.name ||
                    '';
                const otherTableCols = schema?.tables.find((t) => t.name === otherTable)?.columns || [];
                newStep = {
                    _id: nanoid(),
                    type: 'join',
                    joinType: 'inner',
                    table: otherTable,
                    on: [
                        {
                            left: firstCol,
                            right: otherTableCols[0]?.name || 'id',
                        },
                    ],
                };
                break;
            }

            case 'convert':
                newStep = {
                    _id: nanoid(),
                    type: 'mutate',
                    name: firstCol,
                    expression: `CAST("${firstCol}" AS INTEGER)`,
                };
                break;

            case 'mutate':
                newStep = {
                    _id: nanoid(),
                    type: 'mutate',
                    name: 'new_column',
                    expression: `${firstCol}`,
                };
                break;

            case 'select':
                newStep = {
                    _id: nanoid(),
                    type: 'select',
                    columns: currentCols.map((c) => c.name),
                };
                break;

            case 'order':
                newStep = {
                    _id: nanoid(),
                    type: 'order',
                    items: [{ column: firstCol, dir: 'asc' }],
                };
                break;

            case 'limit':
                newStep = {
                    _id: nanoid(),
                    type: 'limit',
                    value: 100,
                };
                break;
        }

        const updated: ClientQueryDefinition = {
            ...definition,
            steps: [...definition.steps, newStep],
        };
        set({ definition: updated, isDirty: true, page: 1 });
        get().recompile();
        get().debounceAutoRun();
    },

    updateStep: (index: number, partialStep: Partial<QueryStep>) => {
        const { definition } = get();
        if (index < 0 || index >= definition.steps.length) return;

        const updatedSteps = [...definition.steps];
        updatedSteps[index] = {
            ...updatedSteps[index],
            ...partialStep,
        } as ClientQueryStep;

        const updated: ClientQueryDefinition = {
            ...definition,
            steps: updatedSteps,
        };
        set({ definition: updated, isDirty: true, page: 1 });
        get().recompile();
        get().debounceAutoRun();
    },

    removeStep: (index: number) => {
        const { definition } = get();
        const updatedSteps = definition.steps.filter((_, i) => i !== index);
        const updated: ClientQueryDefinition = {
            ...definition,
            steps: updatedSteps,
        };
        set({ definition: updated, isDirty: true, page: 1 });
        get().recompile();
        get().debounceAutoRun();
    },

    reorderSteps: (oldIndex: number, newIndex: number) => {
        const { definition } = get();
        if (
            oldIndex < 0 ||
            oldIndex >= definition.steps.length ||
            newIndex < 0 ||
            newIndex >= definition.steps.length
        ) {
            return;
        }

        const items = [...definition.steps];
        const [moved] = items.splice(oldIndex, 1);
        items.splice(newIndex, 0, moved);

        const updated: ClientQueryDefinition = {
            ...definition,
            steps: items,
        };
        set({ definition: updated, isDirty: true, page: 1 });
        get().recompile();
        get().debounceAutoRun();
    },

    recompile: () => {
        const { definition, schema } = get();
        if (!definition.source.table || !schema) {
            set({ compiledSql: null, compileError: null });
            return;
        }

        try {
            const cleanDef = cleanDefinitionForCompile(definition);
            const res = compile(cleanDef, { schema });
            set({ compiledSql: res.sql, compileError: null });
        } catch (err) {
            const message =
                err instanceof CompileError ? err.message : err instanceof Error ? err.message : 'Compilation failed';
            set({ compiledSql: null, compileError: message });
        }
    },

    convertToSql: () => {
        const { definition, schema, compiledSql, sql } = get();
        let targetSql = compiledSql || sql;
        try {
            if (definition.source.table && schema) {
                const cleanDef = cleanDefinitionForCompile(definition);
                const res = compile(cleanDef, { schema });
                if (res.sql) targetSql = inlineParams(res.sql, res.params);
            }
        } catch {
            // fallback
        }
        set({
            mode: 'sql',
            sql: targetSql,
            isDirty: true,
        });
    },

    switchToSqlMode: async () => {
        const { definition, schema, queryId, queryName, dataSourceId, sql } = get();
        let targetSql = sql;
        try {
            if (definition.source.table && schema) {
                const cleanDef = cleanDefinitionForCompile(definition);
                const res = compile(cleanDef, { schema });
                if (res.sql) targetSql = inlineParams(res.sql, res.params);
            }
        } catch {
            // fallback to existing sql
        }
        if (!targetSql.trim() && definition.source.table) {
            targetSql = `SELECT * FROM "${definition.source.table}" LIMIT 100;`;
        }
        set({
            mode: 'sql',
            sql: targetSql,
            isDirty: false,
        });

        if (queryId) {
            try {
                await fetch(`/api/queries/${queryId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: queryName,
                        dataSourceId,
                        mode: 'sql',
                        definition: JSON.stringify(cleanDefinitionForCompile(definition)),
                        sql: targetSql,
                    }),
                });
            } catch {
                // ignore
            }
        }
        void get().runQuery();
    },

    switchToBuilderMode: async () => {
        const { definition, queryId, queryName, dataSourceId, sql } = get();
        get().recompile();
        const compiledSql = get().compiledSql;
        set({
            mode: 'builder',
            sql: compiledSql || sql,
            isDirty: false,
        });

        if (queryId) {
            try {
                await fetch(`/api/queries/${queryId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: queryName,
                        dataSourceId,
                        mode: 'builder',
                        definition: JSON.stringify(cleanDefinitionForCompile(definition)),
                        sql: compiledSql || sql,
                    }),
                });
            } catch {
                // ignore
            }
        }
        void get().runQuery();
    },

    registerSqlInsertHandler: (fn) => {
        set({ sqlInsertHandler: fn });
    },

    insertSqlText: (text: string) => {
        const handler = get().sqlInsertHandler;
        if (handler) {
            handler(text);
        } else {
            const currentSql = get().sql;
            const newSql = currentSql ? `${currentSql} ${text}` : text;
            get().setSql(newSql);
        }
    },

    runQuery: async (pageOverride?: number, isAutoRun?: boolean, signal?: AbortSignal) => {
        if (autoRunTimer) {
            clearTimeout(autoRunTimer);
            autoRunTimer = null;
        }
        const { dataSourceId, mode, definition, sql, pageSize } = get();
        const page = pageOverride ?? get().page;

        if (!dataSourceId) {
            const message = 'Please select a data source first.';
            set({ runError: message, isRunning: false });
            if (!isAutoRun) toast.error(message);
            return;
        }

        if (mode === 'builder' && !definition.source.table) {
            const message = 'Please select a source table in the query builder.';
            set({
                isRunning: false,
                runError: message,
            });
            if (!isAutoRun) toast.error(message);
            return;
        }

        if (mode === 'sql' && !sql.trim()) {
            const message = 'Please enter a SQL query.';
            set({
                isRunning: false,
                runError: message,
            });
            if (!isAutoRun) toast.error(message);
            return;
        }

        set({ isRunning: true, runError: null });

        try {
            let body: Record<string, unknown>;

            if (mode === 'builder') {
                body = {
                    dataSourceId,
                    mode: 'builder',
                    definition: cleanDefinitionForCompile(definition),
                    page,
                    pageSize,
                };
            } else {
                body = {
                    dataSourceId,
                    mode: 'sql',
                    sql,
                    page,
                    pageSize,
                };
            }

            const res = await fetch('/api/queries/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal,
            });

            const json = (await res.json()) as {
                data?: QueryResultData;
                error?: string;
            };

            if (!res.ok || !json.data) {
                const message = json.error || 'Query execution failed.';
                set({
                    results: null,
                    runError: message,
                });
                if (!isAutoRun) {
                    toast.error(message);
                }
            } else {
                set({
                    results: json.data,
                    runError: null,
                    lastRunAt: new Date(),
                    totalRows: json.data.totalRows ?? json.data.rowCount,
                    page,
                });
            }
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                return;
            }
            const message = err instanceof Error ? err.message : 'Network error';
            set({
                results: null,
                runError: message,
            });
            if (!isAutoRun) {
                toast.error(message);
            }
        } finally {
            set({ isRunning: false });
        }
    },

    saveQuery: async () => {
        const { queryId, queryName, dataSourceId, mode, definition, sql, compiledSql } = get();
        if (!queryId) return;

        set({ isSaving: true });
        try {
            const cleanDef = cleanDefinitionForCompile(definition);
            const res = await fetch(`/api/queries/${queryId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: queryName,
                    dataSourceId,
                    mode,
                    definition: JSON.stringify(cleanDef),
                    sql: mode === 'sql' ? sql : compiledSql || sql,
                }),
            });

            if (!res.ok) {
                toast.error('Failed to save query');
                return;
            }
            set({ isDirty: false, lastSavedAt: new Date() });
        } catch (err) {
            toast.error('Failed to save query', {
                description: err instanceof Error ? err.message : 'Network error',
            });
        } finally {
            set({ isSaving: false });
        }
    },
}));
