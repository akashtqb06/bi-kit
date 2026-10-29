import { postgresDialect, type SqlDialect } from '@src/lib/connectors/dialects';
import type { SchemaInfo } from '@src/lib/connectors/types';
import {
    queryDefinitionSchema,
    type QueryDefinition,
    type QueryStep,
    type JoinStep,
    type FilterStep,
    type FilterItem,
    type MutateStep,
    type SummarizeStep,
    type SelectStep,
    type OrderStep,
    type LimitStep,
} from '@src/lib/query-engine/definition';
import {
    isFinanceVirtualTable,
    FINANCE_VIRTUAL_TABLE_NAMES,
    FINANCE_VIRTUAL_TABLES,
    getFinanceSchemaInfo,
    type FinanceVirtualTableName,
} from './catalog';
import { getVirtualTableTemplate } from './templates';

export class CompileError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CompileError';
    }
}

export interface CompileFinanceResult {
    sql: string;
    params: unknown[];
}

export interface CompileFinanceOptions {
    userId: string;
    dialect?: SqlDialect;
}

interface CompilerState {
    ctes: { name: string; body: string }[];
    params: unknown[];
    currentCte: string;
    columns: string[];
    stepIndex: number;
    schema: SchemaInfo;
    dialect: SqlDialect;
    userId: string;
}

function q(name: string, state: CompilerState): string {
    return state.dialect.quoteIdent(name);
}

function nextCteName(state: CompilerState): string {
    return `__s${state.stepIndex}`;
}

function validateTableName(tableName: string): FinanceVirtualTableName {
    if (!isFinanceVirtualTable(tableName)) {
        throw new CompileError(
            `Table "${tableName}" is not a valid finance virtual table. Catalog tables: ${FINANCE_VIRTUAL_TABLE_NAMES.join(', ')}.`
        );
    }
    return tableName;
}

function validateMutateExpression(expression: string): void {
    const lower = expression.toLowerCase();
    // Prevent subqueries, access to physical fin_* tables, users, data_sources, or PostgreSQL system catalogs
    const forbiddenPatterns = [
        /\bselect\b/i,
        /\bfin_[a-z_]+/i,
        /\busers\b/i,
        /\bdata_sources\b/i,
        /\bpg_[a-z_]+/i,
        /\binformation_schema\b/i,
        /;/g,
        /--/g,
        /\/\*/g,
    ];

    for (const pattern of forbiddenPatterns) {
        if (pattern.test(lower)) {
            throw new CompileError(
                `Mutate expression contains forbidden keyword or table reference: "${expression}".`
            );
        }
    }
}

function compileFilterItem(
    item: FilterItem,
    state: CompilerState,
    availableColumns: string[]
): string {
    const { column, op, value } = item;

    if (!availableColumns.includes(column)) {
        throw new CompileError(
            `Filter references unknown column "${column}". Available: ${availableColumns.join(', ')}.`
        );
    }

    const colExpr = q(column, state);

    switch (op) {
        case 'is null':
            return `${colExpr} IS NULL`;

        case 'is not null':
            return `${colExpr} IS NOT NULL`;

        case '=':
        case '!=':
        case '>':
        case '>=':
        case '<':
        case '<=': {
            state.params.push(value);
            const ph = state.dialect.placeholder(state.params.length);
            return `${colExpr} ${op} ${ph}`;
        }

        case 'in':
        case 'not in': {
            if (!Array.isArray(value) || value.length === 0) {
                throw new CompileError(
                    `Operator "${op}" requires a non-empty array value for column "${column}".`
                );
            }
            const placeholders = (value as unknown[])
                .map((v) => {
                    state.params.push(v);
                    return state.dialect.placeholder(state.params.length);
                })
                .join(', ');
            return `${colExpr} ${op === 'in' ? 'IN' : 'NOT IN'} (${placeholders})`;
        }

        case 'contains': {
            state.params.push(`%${String(value)}%`);
            const ph = state.dialect.placeholder(state.params.length);
            return state.dialect.containsExpr(colExpr, ph, true);
        }

        case 'starts with': {
            state.params.push(`${String(value)}%`);
            const ph = state.dialect.placeholder(state.params.length);
            return `${colExpr} LIKE ${ph}`;
        }

        case 'between': {
            if (!Array.isArray(value) || value.length !== 2) {
                throw new CompileError(
                    `Operator "between" requires [low, high] for column "${column}".`
                );
            }
            state.params.push((value as unknown[])[0]);
            const p1 = state.dialect.placeholder(state.params.length);
            state.params.push((value as unknown[])[1]);
            const p2 = state.dialect.placeholder(state.params.length);
            return `${colExpr} BETWEEN ${p1} AND ${p2}`;
        }
    }
}

function compileJoin(step: JoinStep, state: CompilerState): void {
    const validTable = validateTableName(step.table);
    const joinCols = FINANCE_VIRTUAL_TABLES[validTable].columns.map((c) => c.name);

    for (const cond of step.on) {
        if (!state.columns.includes(cond.left)) {
            throw new CompileError(
                `Join condition references unknown left column "${cond.left}". Available: ${state.columns.join(', ')}.`
            );
        }
        if (!joinCols.includes(cond.right)) {
            throw new CompileError(
                `Join condition references unknown right column "${cond.right}" in virtual table "${step.table}".`
            );
        }
    }

    const cteName = nextCteName(state);
    const joinKeyword = step.joinType === 'inner' ? 'INNER JOIN' : 'LEFT JOIN';
    const onClause = step.on
        .map(
            (cond) =>
                `${q(state.currentCte, state)}.${q(cond.left, state)} = ${q(step.table, state)}.${q(cond.right, state)}`
        )
        .join(' AND ');

    const newCols = joinCols.filter((c) => !state.columns.includes(c));
    const mergedCols = [...state.columns, ...newCols];

    const selectList = [
        ...state.columns.map((c) => `${q(state.currentCte, state)}.${q(c, state)} AS ${q(c, state)}`),
        ...newCols.map((c) => `${q(step.table, state)}.${q(c, state)} AS ${q(c, state)}`),
    ].join(', ');

    const body = `SELECT ${selectList} FROM ${q(state.currentCte, state)} ${joinKeyword} ${q(step.table, state)} ON ${onClause}`;

    state.ctes.push({ name: cteName, body });
    state.currentCte = cteName;
    state.columns = mergedCols;
    state.stepIndex++;
}

function compileFilter(step: FilterStep, state: CompilerState): void {
    const { logic, items } = step.conditions;
    const fragments = items.map((item) =>
        compileFilterItem(item, state, state.columns)
    );
    const whereClause = fragments.join(` ${logic.toUpperCase()} `);

    const cteName = nextCteName(state);
    const body = `SELECT * FROM ${q(state.currentCte, state)} WHERE ${whereClause}`;

    state.ctes.push({ name: cteName, body });
    state.currentCte = cteName;
    state.stepIndex++;
}

function compileMutate(step: MutateStep, state: CompilerState): void {
    validateMutateExpression(step.expression);

    const cteName = nextCteName(state);
    const otherCols = state.columns.filter((c) => c !== step.name).map((c) => q(c, state));
    const selectList = [...otherCols, `(${step.expression}) AS ${q(step.name, state)}`].join(', ');
    const body = `SELECT ${selectList} FROM ${q(state.currentCte, state)}`;

    const nextCols = state.columns.includes(step.name)
        ? state.columns
        : [...state.columns, step.name];

    state.ctes.push({ name: cteName, body });
    state.currentCte = cteName;
    state.columns = nextCols;
    state.stepIndex++;
}

function compileSummarize(step: SummarizeStep, state: CompilerState): void {
    for (const g of step.groupBy) {
        if (!state.columns.includes(g.column)) {
            throw new CompileError(
                `Group-by references unknown column "${g.column}". Available: ${state.columns.join(', ')}.`
            );
        }
    }
    for (const agg of step.aggregates) {
        if (!state.columns.includes(agg.column)) {
            throw new CompileError(
                `Aggregate references unknown column "${agg.column}". Available: ${state.columns.join(', ')}.`
            );
        }
    }

    const groupExpressions: string[] = [];
    const selectGroupItems: string[] = [];
    const groupAliases: string[] = [];

    for (const g of step.groupBy) {
        const colExpr = q(g.column, state);
        if (g.dateGrain) {
            const grainExpr = state.dialect.dateTruncExpr(colExpr, g.dateGrain);
            const alias = g.column;
            groupExpressions.push(grainExpr);
            selectGroupItems.push(`${grainExpr} AS ${q(alias, state)}`);
            groupAliases.push(alias);
        } else {
            groupExpressions.push(colExpr);
            selectGroupItems.push(`${colExpr} AS ${q(g.column, state)}`);
            groupAliases.push(g.column);
        }
    }

    const aggExpressions: string[] = [];
    const aggAliases: string[] = [];

    for (const agg of step.aggregates) {
        const colExpr = q(agg.column, state);
        const aggExpr = state.dialect.aggregateExpr(agg.fn, colExpr);
        aggExpressions.push(`${aggExpr} AS ${q(agg.alias, state)}`);
        aggAliases.push(agg.alias);
    }

    const allSelects = [...selectGroupItems, ...aggExpressions].join(', ');
    const groupByClause =
        groupExpressions.length > 0 ? ` GROUP BY ${groupExpressions.join(', ')}` : '';

    const cteName = nextCteName(state);
    const body = `SELECT ${allSelects} FROM ${q(state.currentCte, state)}${groupByClause}`;

    state.ctes.push({ name: cteName, body });
    state.currentCte = cteName;
    state.columns = [...groupAliases, ...aggAliases];
    state.stepIndex++;
}

function compileSelect(step: SelectStep, state: CompilerState): void {
    for (const col of step.columns) {
        if (!state.columns.includes(col)) {
            throw new CompileError(
                `Select references unknown column "${col}". Available: ${state.columns.join(', ')}.`
            );
        }
    }

    const cteName = nextCteName(state);
    const selectList = step.columns.map((c) => q(c, state)).join(', ');
    const body = `SELECT ${selectList} FROM ${q(state.currentCte, state)}`;

    state.ctes.push({ name: cteName, body });
    state.currentCte = cteName;
    state.columns = step.columns;
    state.stepIndex++;
}

function compileOrder(step: OrderStep, state: CompilerState): void {
    for (const item of step.items) {
        if (!state.columns.includes(item.column)) {
            throw new CompileError(
                `Order by references unknown column "${item.column}". Available: ${state.columns.join(', ')}.`
            );
        }
    }

    const cteName = nextCteName(state);
    const orderItems = step.items
        .map((item) => `${q(item.column, state)} ${item.dir.toUpperCase()}`)
        .join(', ');
    const body = `SELECT * FROM ${q(state.currentCte, state)} ORDER BY ${orderItems}`;

    state.ctes.push({ name: cteName, body });
    state.currentCte = cteName;
    state.stepIndex++;
}

function compileLimit(step: LimitStep, state: CompilerState): void {
    const cteName = nextCteName(state);
    const body = `SELECT * FROM ${q(state.currentCte, state)} LIMIT ${step.value}`;

    state.ctes.push({ name: cteName, body });
    state.currentCte = cteName;
    state.stepIndex++;
}

function compileStep(step: QueryStep, state: CompilerState): void {
    switch (step.type) {
        case 'join':
            compileJoin(step, state);
            break;
        case 'filter':
            compileFilter(step, state);
            break;
        case 'mutate':
            compileMutate(step, state);
            break;
        case 'summarize':
            compileSummarize(step, state);
            break;
        case 'select':
            compileSelect(step, state);
            break;
        case 'order':
            compileOrder(step, state);
            break;
        case 'limit':
            compileLimit(step, state);
            break;
    }
}

/**
 * Scoping Compiler for Finance Virtual Tables
 *
 * Resolves virtual table references, binds the authenticated userId as parameter $1,
 * substitutes `(<template with user id bound>) AS name`, and compiles all builder
 * steps safely with zero possibility of cross-user data leakage.
 */
export function compileFinanceQuery(
    rawDefinition: unknown,
    options: CompileFinanceOptions
): CompileFinanceResult {
    if (!options.userId || typeof options.userId !== 'string') {
        throw new CompileError('A valid user ID is required for scoped finance query compilation.');
    }

    const definition: QueryDefinition = queryDefinitionSchema.parse(rawDefinition);
    const primaryTable = validateTableName(definition.source.table);
    const dialect = options.dialect ?? postgresDialect;

    // Collect all referenced virtual tables (source + joins)
    const referencedTables = new Set<FinanceVirtualTableName>();
    referencedTables.add(primaryTable);

    for (const step of definition.steps) {
        if (step.type === 'join') {
            referencedTables.add(validateTableName(step.table));
        }
    }

    // Parameter 1 is always the authenticated user ID
    const params: unknown[] = [options.userId];

    // Build the initial virtual table CTEs
    const virtualTableCtes: { name: string; body: string }[] = [];
    for (const tableName of referencedTables) {
        const templateSql = getVirtualTableTemplate(tableName, '$1');
        virtualTableCtes.push({
            name: tableName,
            body: templateSql,
        });
    }

    // Step 0 reads from the primary virtual table CTE
    const initialCteName = '__s0';
    const sourceColumns = FINANCE_VIRTUAL_TABLES[primaryTable].columns.map((c) => c.name);

    const state: CompilerState = {
        ctes: [
            ...virtualTableCtes,
            {
                name: initialCteName,
                body: `SELECT * FROM ${dialect.quoteIdent(primaryTable)}`,
            },
        ],
        params,
        currentCte: initialCteName,
        columns: sourceColumns,
        stepIndex: 1,
        schema: getFinanceSchemaInfo(),
        dialect,
        userId: options.userId,
    };

    // Compile each query step sequentially
    for (const step of definition.steps) {
        compileStep(step, state);
    }

    // Assemble final SQL query
    const cteClause = state.ctes
        .map(({ name, body }) => `${dialect.quoteIdent(name)} AS (\n${body}\n)`)
        .join(',\n');

    const sql = `WITH ${cteClause}\nSELECT * FROM ${dialect.quoteIdent(state.currentCte)}`;

    return { sql, params: state.params };
}
