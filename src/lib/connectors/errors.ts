export class ConnectorError extends Error {
    constructor(
        message: string,
        public readonly code?: string,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = 'ConnectorError';
    }
}

export class NotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NotFoundError';
    }
}

export class ConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConflictError';
    }
}

export class BadRequestError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BadRequestError';
    }
}

export class NetworkGuardError extends ConnectorError {
    constructor(message: string, code = 'NETWORK_GUARD_REJECTED') {
        super(message, code);
        this.name = 'NetworkGuardError';
    }
}

export class ReadOnlyValidationError extends ConnectorError {
    constructor(message: string) {
        super(message, 'NOT_READONLY');
        this.name = 'ReadOnlyValidationError';
    }
}
