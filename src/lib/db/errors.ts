import 'server-only';

/**
 * Redacts secrets such as database passwords, connection URLs, and tokens
 * to ensure sensitive credentials do not leak into server or client error logs.
 */
export function redactSecrets(text: string): string {
    if (!text) return '';
    // Redact passwords in connection URLs: e.g. postgres://user:password@host:port/db
    let redacted = text.replace(/([a-zA-Z+]+:\/\/[^:]+:)[^@]+(@)/g, '$1***$2');
    // Redact connection string password parameters: e.g. password=secret or password = "secret"
    redacted = redacted.replace(/(password\s*[:=]\s*['"]?)[^'"\s,;]+(['"]?)/gi, '$1***$2');
    redacted = redacted.replace(/(secret\s*[:=]\s*['"]?)[^'"\s,;]+(['"]?)/gi, '$1***$2');
    redacted = redacted.replace(/(token\s*[:=]\s*['"]?)[^'"\s,;]+(['"]?)/gi, '$1***$2');
    return redacted;
}

export interface ExtractedCauseInfo {
    code?: string;
    message?: string;
}

/**
 * Extracts error code and message from an error, including Drizzle's `error.cause`,
 * AggregateError's `errors` array, or Node network exceptions.
 */
export function extractCauseInfo(error: unknown): ExtractedCauseInfo {
    if (!error) return {};
    const e = error as Record<string, unknown>;
    const cause = (e.cause ?? (e.name === 'AggregateError' ? (e.errors as unknown[])?.[0] : undefined)) as
        | Record<string, unknown>
        | undefined;

    let code: string | undefined = (e.code as string) || (cause?.code as string);
    if (!code && e.name === 'AggregateError' && Array.isArray(e.errors) && e.errors[0]) {
        code = e.errors[0]?.code as string;
    }
    if (!code && cause?.name === 'AggregateError' && Array.isArray(cause.errors) && cause.errors[0]) {
        code = cause.errors[0]?.code as string;
    }

    let message: string | undefined;
    if (cause && typeof cause === 'object' && typeof cause.message === 'string' && cause.message.trim()) {
        message = cause.message.trim();
    } else if (cause?.name === 'AggregateError' && Array.isArray(cause.errors) && cause.errors[0]?.message) {
        message = String(cause.errors[0].message).trim();
    } else if (e.name === 'AggregateError' && Array.isArray(e.errors) && e.errors[0]?.message) {
        message = String(e.errors[0].message).trim();
    } else if (typeof cause === 'string') {
        message = (cause as string).trim();
    }

    return { code, message };
}

/**
 * Wraps a database error so that the logged message includes `error.cause.code` and
 * `message` (with secrets redacted) instead of only "Failed query".
 * Preserves the original `error.cause` for programmatic inspections.
 */
export function wrapDbError(error: unknown): Error {
    if (!(error instanceof Error)) {
        return new Error(redactSecrets(String(error)));
    }
    if ((error as unknown as { __isDbEnhanced?: boolean }).__isDbEnhanced) {
        return error;
    }

    const { code, message: causeMsg } = extractCauseInfo(error);
    const parts: string[] = [];
    if (code) parts.push(code);
    if (causeMsg && (!code || !causeMsg.toLowerCase().includes(code.toLowerCase()))) {
        parts.push(causeMsg);
    } else if (causeMsg && parts.length === 0) {
        parts.push(causeMsg);
    }
    const causeInfo = parts.join(': ');

    let newMsg = error.message;
    if (causeInfo) {
        if (newMsg.startsWith('Failed query:')) {
            newMsg = newMsg.replace(/^Failed query:/, `Failed query [${causeInfo}]:`);
        } else if (!newMsg.includes(causeInfo)) {
            newMsg = `[${causeInfo}] ${newMsg}`;
        }
    }

    newMsg = redactSecrets(newMsg);

    try {
        error.message = newMsg;
    } catch {
        const newErr = new Error(newMsg, { cause: (error as unknown as { cause?: unknown }).cause ?? error });
        newErr.name = error.name;
        newErr.stack = error.stack;
        (newErr as unknown as { __isDbEnhanced: boolean }).__isDbEnhanced = true;
        if (code) (newErr as unknown as { code: string }).code = code;
        return newErr;
    }

    (error as unknown as { __isDbEnhanced: boolean }).__isDbEnhanced = true;
    if (code && !(error as unknown as { code?: string }).code) {
        (error as unknown as { code: string }).code = code;
    }
    return error;
}

/**
 * Wraps any query thenable/builder so that errors caught during execution
 * are passed through `wrapDbError`.
 */
export function wrapQueryThenable<T>(thenable: T): T {
    if (!thenable || typeof thenable !== 'object') return thenable;
    const t = thenable as unknown as {
        then?: (onfulfilled?: unknown, onrejected?: unknown) => unknown;
        execute?: (...args: unknown[]) => Promise<unknown>;
        all?: (...args: unknown[]) => Promise<unknown>;
    };

    if (typeof t.then === 'function') {
        const origThen = t.then.bind(t);
        t.then = function (onfulfilled?: unknown, onrejected?: unknown) {
            return origThen(
                onfulfilled as (...args: unknown[]) => unknown,
                onrejected
                    ? (err: unknown) => (onrejected as (err: unknown) => unknown)(wrapDbError(err))
                    : (err: unknown) => {
                          throw wrapDbError(err);
                      }
            );
        };
    }

    if (typeof t.execute === 'function') {
        const origExecute = t.execute.bind(t);
        t.execute = async function (...args: unknown[]) {
            try {
                return await origExecute(...args);
            } catch (err) {
                throw wrapDbError(err);
            }
        };
    }

    if (typeof t.all === 'function') {
        const origAll = t.all.bind(t);
        t.all = async function (...args: unknown[]) {
            try {
                return await origAll(...args);
            } catch (err) {
                throw wrapDbError(err);
            }
        };
    }

    return thenable;
}

/**
 * Attaches prepared-query wrapping to a Drizzle session so that every
 * SQL query executed through the session has its error wrapped with cause details.
 */
export function wrapDrizzleSession(drizzleDb: unknown): void {
    if (!drizzleDb || typeof drizzleDb !== 'object') return;
    const session = (drizzleDb as unknown as { session?: Record<string, unknown> }).session;
    if (!session || (session as unknown as { __wrappedForErrors?: boolean }).__wrappedForErrors) return;
    (session as unknown as { __wrappedForErrors: boolean }).__wrappedForErrors = true;

    if (typeof session.prepareQuery === 'function') {
        const origPrepareQuery = session.prepareQuery.bind(session);
        session.prepareQuery = function (...args: unknown[]) {
            const pq = origPrepareQuery(...args) as Record<string, unknown> | undefined;
            if (!pq) return pq;

            if (typeof pq.execute === 'function') {
                const origExec = pq.execute.bind(pq);
                pq.execute = async function (...execArgs: unknown[]) {
                    try {
                        return await origExec(...execArgs);
                    } catch (err) {
                        throw wrapDbError(err);
                    }
                };
            }

            if (typeof pq.all === 'function') {
                const origAll = pq.all.bind(pq);
                pq.all = async function (...allArgs: unknown[]) {
                    try {
                        return await origAll(...allArgs);
                    } catch (err) {
                        throw wrapDbError(err);
                    }
                };
            }

            if (typeof pq.values === 'function') {
                const origValues = pq.values.bind(pq);
                pq.values = async function (...vArgs: unknown[]) {
                    try {
                        return await origValues(...vArgs);
                    } catch (err) {
                        throw wrapDbError(err);
                    }
                };
            }

            return pq;
        };
    }

    if (typeof session.transaction === 'function') {
        const origTx = session.transaction.bind(session);
        session.transaction = async function (transaction: (tx: unknown) => unknown, config?: unknown) {
            try {
                return await origTx(async (txSession: unknown) => {
                    wrapDrizzleSession({ session: txSession });
                    return await transaction(txSession);
                }, config);
            } catch (err) {
                throw wrapDbError(err);
            }
        };
    }
}
