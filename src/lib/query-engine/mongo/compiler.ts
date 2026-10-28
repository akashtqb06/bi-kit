import type { QueryDefinition, FilterItem } from '../definition';
import type { SchemaInfo } from '../../connectors/types';
import { CompileError } from '../compiler';

export interface MongoCompileResult {
    collection: string;
    pipeline: Record<string, unknown>[];
    expectedColumns?: string[];
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Tokenize and parse a safe subset of mathematical/string expressions into MongoDB expressions:
 * Supports: column identifiers ("col" or col), numbers, strings, binary operators (+, -, *, /),
 * and basic functions (concat, to_number, to_string, to_date).
 * Rejects any arbitrary JavaScript, $where, or code execution.
 */
export function compileExpressionToMongo(expr: string): unknown {
    if (!expr || typeof expr !== 'string') {
        throw new CompileError('Expression must be a non-empty string.');
    }

    const trimmed = expr.trim();

    // Check for dangerous keywords
    if (/\b(function|eval|where|global|window|process|require|import)\b/i.test(trimmed)) {
        throw new CompileError('Arbitrary code execution or JavaScript functions are not allowed in expressions.');
    }

    // Number literal
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return parseFloat(trimmed);
    }

    // String literal in single or double quotes
    if (/^'([^']*)'$/.test(trimmed) || /^"([^"]*)"$/.test(trimmed) && !trimmed.slice(1, -1).match(/^[A-Za-z_][A-Za-z0-9_.]*$/)) {
        return trimmed.slice(1, -1);
    }

    // Single column identifier (e.g. "quantity" or price)
    if (/^"([A-Za-z_][A-Za-z0-9_.]*)"$/.test(trimmed)) {
        return `$${trimmed.slice(1, -1)}`;
    }
    if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(trimmed)) {
        return `$${trimmed}`;
    }

    // Binary arithmetic expressions: e.g. "quantity" * "price" or col_a + col_b
    // Parse respecting precedence: + - (lowest), * / (higher)
    const operators = [
        { op: '+', mongoOp: '$add' },
        { op: '-', mongoOp: '$subtract' },
        { op: '*', mongoOp: '$multiply' },
        { op: '/', mongoOp: '$divide' },
    ];

    // Find the rightmost lowest precedence operator outside quotes/parentheses
    for (const { op, mongoOp } of operators) {
        let depth = 0;
        let inSingleQuote = false;
        let inDoubleQuote = false;
        for (let i = trimmed.length - 1; i >= 0; i--) {
            const ch = trimmed[i];
            if (ch === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
            else if (ch === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
            else if (!inSingleQuote && !inDoubleQuote) {
                if (ch === ')') depth++;
                else if (ch === '(') depth--;
                else if (depth === 0 && ch === op) {
                    const leftStr = trimmed.slice(0, i).trim();
                    const rightStr = trimmed.slice(i + 1).trim();
                    if (leftStr && rightStr) {
                        return {
                            [mongoOp]: [
                                compileExpressionToMongo(leftStr),
                                compileExpressionToMongo(rightStr),
                            ],
                        };
                    }
                }
            }
        }
    }

    // Wrapped in parentheses: ( ... )
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
        return compileExpressionToMongo(trimmed.slice(1, -1));
    }

    // Function calls: concat(a, b), to_number(x), to_string(x), to_date(x)
    const funcMatch = trimmed.match(/^([a-zA-Z_]+)\s*\(([\s\S]*)\)$/);
    if (funcMatch) {
        const funcName = funcMatch[1].toLowerCase();
        const argsStr = funcMatch[2].trim();
        const args = splitArguments(argsStr).map(compileExpressionToMongo);

        switch (funcName) {
            case 'concat':
                return { $concat: args };
            case 'to_number':
            case 'cast_number':
                return { $toDouble: args[0] };
            case 'to_string':
            case 'cast_string':
                return { $toString: args[0] };
            case 'to_date':
            case 'cast_date':
                return { $toDate: args[0] };
            default:
                throw new CompileError(`Unsupported function in expression: "${funcName}".`);
        }
    }

    throw new CompileError(`Could not compile expression to MongoDB: "${expr}".`);
}

function splitArguments(argsStr: string): string[] {
    const args: string[] = [];
    let start = 0;
    let depth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < argsStr.length; i++) {
        const ch = argsStr[i];
        if (ch === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
        else if (ch === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
        else if (!inSingleQuote && !inDoubleQuote) {
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            else if (ch === ',' && depth === 0) {
                args.push(argsStr.slice(start, i).trim());
                start = i + 1;
            }
        }
    }
    const tail = argsStr.slice(start).trim();
    if (tail) args.push(tail);
    return args;
}

function compileFilterCondition(cond: FilterItem): Record<string, unknown> {
    const { column, op, value } = cond;

    switch (op) {
        case '=':
            return { [column]: value };
        case '!=':
            return { [column]: { $ne: value } };
        case '>':
            return { [column]: { $gt: value } };
        case '>=':
            return { [column]: { $gte: value } };
        case '<':
            return { [column]: { $lt: value } };
        case '<=':
            return { [column]: { $lte: value } };
        case 'in': {
            const arr = Array.isArray(value)
                ? value
                : typeof value === 'string'
                  ? value.split(',').map((s) => s.trim())
                  : [value];
            return { [column]: { $in: arr } };
        }
        case 'not in': {
            const arr = Array.isArray(value)
                ? value
                : typeof value === 'string'
                  ? value.split(',').map((s) => s.trim())
                  : [value];
            return { [column]: { $nin: arr } };
        }
        case 'contains':
            return { [column]: { $regex: escapeRegex(String(value ?? '')), $options: 'i' } };
        case 'starts with':
            return { [column]: { $regex: `^${escapeRegex(String(value ?? ''))}`, $options: 'i' } };
        case 'is null':
            return {
                $or: [{ [column]: null }, { [column]: { $exists: false } }],
            };
        case 'is not null':
            return { [column]: { $ne: null, $exists: true } };
        case 'between': {
            if (Array.isArray(value) && value.length >= 2) {
                return { [column]: { $gte: value[0], $lte: value[1] } };
            }
            return { [column]: value };
        }
        default:
            return { [column]: value };
    }
}

/**
 * Compile a QueryDefinition into a MongoDB aggregation pipeline.
 */
export function compileToPipeline(
    definition: QueryDefinition,
    schemaContext?: { schema?: SchemaInfo },
    serverVersion?: string
): MongoCompileResult {
    const collection = definition.source.table;
    if (!collection) {
        throw new CompileError('A source collection is required to compile a MongoDB pipeline.');
    }

    const pipeline: Record<string, unknown>[] = [];
    const isOldMongo = serverVersion ? parseFloat(serverVersion) < 5.0 : false;
    let currentColumns: string[] | undefined;

    // Initialize currentColumns if schema is available
    if (schemaContext?.schema) {
        const table = schemaContext.schema.tables.find((t) => t.name === collection);
        if (table) {
            currentColumns = table.columns.map((c) => c.name);
        }
    }

    for (const step of definition.steps) {
        switch (step.type) {
            case 'filter': {
                const { logic, items } = step.conditions;
                if (!items || items.length === 0) break;

                const matchClauses = items.map(compileFilterCondition);
                if (matchClauses.length === 1) {
                    pipeline.push({ $match: matchClauses[0] });
                } else if (logic === 'or') {
                    pipeline.push({ $match: { $or: matchClauses } });
                } else {
                    pipeline.push({ $match: { $and: matchClauses } });
                }
                break;
            }

            case 'join': {
                const targetTable = step.table;
                const leftCol = step.on[0]?.left;
                const rightCol = step.on[0]?.right;

                if (!targetTable || !leftCol || !rightCol) {
                    throw new CompileError('Join step requires table name and ON conditions.');
                }

                pipeline.push({
                    $lookup: {
                        from: targetTable,
                        localField: leftCol,
                        foreignField: rightCol,
                        as: targetTable,
                    },
                });

                pipeline.push({
                    $unwind: {
                        path: `$${targetTable}`,
                        preserveNullAndEmptyArrays: step.joinType === 'left',
                    },
                });

                // Flatten joined collection fields into top-level for standard query expressions
                if (schemaContext?.schema) {
                    const joinedTableSchema = schemaContext.schema.tables.find((t) => t.name === targetTable);
                    if (joinedTableSchema) {
                        const addFieldsObj: Record<string, string> = {};
                        for (const col of joinedTableSchema.columns) {
                            addFieldsObj[`${targetTable}.${col.name}`] = `$${targetTable}.${col.name}`;
                        }
                        pipeline.push({ $addFields: addFieldsObj });
                        currentColumns = [
                            ...(currentColumns || []),
                            ...joinedTableSchema.columns.map((c) => `${targetTable}.${c.name}`),
                        ];
                    }
                }
                break;
            }

            case 'mutate': {
                const exprMongo = compileExpressionToMongo(step.expression);
                pipeline.push({
                    $addFields: {
                        [step.name]: exprMongo,
                    },
                });
                if (currentColumns && !currentColumns.includes(step.name)) {
                    currentColumns.push(step.name);
                }
                break;
            }

            case 'summarize': {
                const groupObj: Record<string, unknown> = {};
                const idObj: Record<string, unknown> = {};
                const distinctCols: { alias: string; setField: string }[] = [];

                // Group By keys
                for (const g of step.groupBy) {
                    if (g.dateGrain) {
                        if (isOldMongo) {
                            let format = '%Y-%m-%d';
                            if (g.dateGrain === 'month') format = '%Y-%m-01 00:00:00';
                            else if (g.dateGrain === 'year') format = '%Y-01-01 00:00:00';
                            else if (g.dateGrain === 'week') format = '%Y-%U';
                            idObj[g.column] = {
                                $dateToString: {
                                    format,
                                    date: `$${g.column}`,
                                },
                            };
                        } else {
                            idObj[g.column] = {
                                $dateTrunc: {
                                    date: `$${g.column}`,
                                    unit: g.dateGrain,
                                },
                            };
                        }
                    } else {
                        idObj[g.column] = `$${g.column}`;
                    }
                }

                groupObj._id = step.groupBy.length > 0 ? idObj : null;

                // Aggregates
                for (const agg of step.aggregates) {
                    const colRef = `$${agg.column}`;
                    switch (agg.fn) {
                        case 'sum':
                            groupObj[agg.alias] = { $sum: colRef };
                            break;
                        case 'avg':
                            groupObj[agg.alias] = { $avg: colRef };
                            break;
                        case 'min':
                            groupObj[agg.alias] = { $min: colRef };
                            break;
                        case 'max':
                            groupObj[agg.alias] = { $max: colRef };
                            break;
                        case 'count':
                            groupObj[agg.alias] = { $sum: 1 };
                            break;
                        case 'count_distinct': {
                            const setField = `__set_${agg.alias}`;
                            groupObj[setField] = { $addToSet: colRef };
                            distinctCols.push({ alias: agg.alias, setField });
                            break;
                        }
                    }
                }

                pipeline.push({ $group: groupObj });

                // Project to reshape _id and unpack distinct counts
                const projectObj: Record<string, unknown> = { _id: 0 };
                const outputCols: string[] = [];

                for (const g of step.groupBy) {
                    projectObj[g.column] = step.groupBy.length > 0 ? `$_id.${g.column}` : null;
                    outputCols.push(g.column);
                }

                for (const agg of step.aggregates) {
                    if (agg.fn === 'count_distinct') {
                        projectObj[agg.alias] = { $size: `$__set_${agg.alias}` };
                    } else {
                        projectObj[agg.alias] = 1;
                    }
                    outputCols.push(agg.alias);
                }

                pipeline.push({ $project: projectObj });
                currentColumns = outputCols;
                break;
            }

            case 'select': {
                const projectObj: Record<string, number> = { _id: 0 };
                for (const col of step.columns) {
                    projectObj[col] = 1;
                }
                pipeline.push({ $project: projectObj });
                currentColumns = step.columns;
                break;
            }

            case 'order': {
                const sortObj: Record<string, number> = {};
                for (const item of step.items) {
                    sortObj[item.column] = item.dir === 'desc' ? -1 : 1;
                }
                pipeline.push({ $sort: sortObj });
                break;
            }

            case 'limit': {
                if (step.value !== undefined && step.value > 0) {
                    pipeline.push({ $limit: step.value });
                }
                break;
            }
        }
    }

    return {
        collection,
        pipeline,
        expectedColumns: currentColumns,
    };
}
