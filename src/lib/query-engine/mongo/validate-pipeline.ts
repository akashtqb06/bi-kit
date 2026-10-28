import { ReadOnlyValidationError } from '@src/lib/connectors/errors';

const ALLOWED_STAGES = new Set([
    '$match',
    '$project',
    '$group',
    '$sort',
    '$skip',
    '$limit',
    '$unwind',
    '$lookup',
    '$addFields',
    '$set',
    '$unset',
    '$count',
    '$facet',
    '$sample',
    '$replaceRoot',
    '$replaceWith',
    '$redact',
    '$bucket',
    '$bucketAuto',
    '$sortByCount',
]);

const FORBIDDEN_OPERATORS = new Set([
    '$out',
    '$merge',
    '$function',
    '$accumulator',
    '$where',
    '$eval',
    '$mapReduce',
]);

/**
 * Recursively inspect an object or array to ensure no forbidden mutation, code execution,
 * or arbitrary JavaScript operators are present at any depth.
 */
function inspectForForbiddenOperators(node: unknown, path = ''): void {
    if (!node || typeof node !== 'object') {
        return;
    }

    if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
            inspectForForbiddenOperators(node[i], `${path}[${i}]`);
        }
        return;
    }

    const obj = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (FORBIDDEN_OPERATORS.has(lowerKey)) {
            throw new ReadOnlyValidationError(
                `Forbidden aggregation operator "${key}" detected at ${path || 'root'}. Write operations and raw JavaScript execution are not permitted.`
            );
        }

        // Sub-pipeline inspection in $lookup
        if (key === '$lookup' && value && typeof value === 'object') {
            const lookupObj = value as Record<string, unknown>;
            if (Array.isArray(lookupObj.pipeline)) {
                validatePipelineStages(lookupObj.pipeline, `${path}.$lookup.pipeline`);
            }
        }

        // Sub-pipeline inspection in $facet
        if (key === '$facet' && value && typeof value === 'object') {
            const facetObj = value as Record<string, unknown>;
            for (const [facetName, facetPipeline] of Object.entries(facetObj)) {
                if (Array.isArray(facetPipeline)) {
                    validatePipelineStages(facetPipeline, `${path}.$facet.${facetName}`);
                }
            }
        }

        inspectForForbiddenOperators(value, path ? `${path}.${key}` : key);
    }
}

/**
 * Validate that all top-level stages of a pipeline belong to the allowed read-only list.
 */
function validatePipelineStages(pipeline: unknown[], context = 'root'): void {
    if (!Array.isArray(pipeline)) {
        throw new ReadOnlyValidationError(`Aggregation pipeline at ${context} must be an array of stage objects.`);
    }

    for (let i = 0; i < pipeline.length; i++) {
        const stage = pipeline[i];
        if (!stage || typeof stage !== 'object' || Array.isArray(stage)) {
            throw new ReadOnlyValidationError(`Pipeline stage at ${context}[${i}] must be a valid stage object.`);
        }

        const keys = Object.keys(stage);
        if (keys.length === 0) {
            throw new ReadOnlyValidationError(`Empty pipeline stage at ${context}[${i}].`);
        }

        const stageName = keys[0];
        if (FORBIDDEN_OPERATORS.has(stageName.toLowerCase())) {
            throw new ReadOnlyValidationError(
                `Stage "${stageName}" is forbidden. Mutation stages like $out or $merge are not permitted.`
            );
        }

        if (!ALLOWED_STAGES.has(stageName)) {
            throw new ReadOnlyValidationError(
                `Unsupported or unauthorized aggregation stage "${stageName}" at ${context}[${i}].`
            );
        }
    }
}

/**
 * Deep recursive validation of a MongoDB aggregation pipeline:
 * 1. Checks that all stages are on the allow-list.
 * 2. Deeply rejects $out, $merge, $function, $accumulator, $where across all stages and sub-pipelines.
 */
export function validateMongoPipeline(pipeline: unknown): void {
    if (!Array.isArray(pipeline)) {
        throw new ReadOnlyValidationError('Aggregation pipeline must be an array of stages.');
    }

    // 1. Stage allow-list check
    validatePipelineStages(pipeline);

    // 2. Deep recursive forbidden operator check
    inspectForForbiddenOperators(pipeline);
}
