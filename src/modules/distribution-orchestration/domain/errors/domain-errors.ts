/**
 * Domain errors — the foundation for self-validating VOs + transition guards.
 *
 * Principle: the domain does NOT know about HTTP. Do NOT drag Nest's `HttpException` in here.
 * The adapter/application (later phases) catches `DomainError` and maps it to HTTP/log.
 */

/** Base for every domain error — the application catches this to classify. */
export class DomainError extends Error {
	constructor(message: string) {
		super(message);
		// keep the real class name after transpiling down to ES5/ES2021 (extends Error)
		this.name = new.target.name;
	}
}

/**
 * Invalid transition: a command was called in the wrong state.
 * INV-D9: does NOT change state, does NOT emit events when this is thrown.
 */
export class InvalidTransitionError extends DomainError {
	constructor(
		public readonly from: string,
		public readonly method: string,
	) {
		super(`Invalid transition: cannot '${method}' from state '${from}'`);
	}
}

/** A VO/aggregate violated an invariant (e.g. malformed UPC, GATE skipped). */
export class InvariantViolationError extends DomainError {
	constructor(
		public readonly context: string,
		message: string,
	) {
		super(`[${context}] ${message}`);
	}
}

/** Poison detection: retry exceeded the threshold → stop auto, switch to manual handling. */
export class RetryLimitExceededError extends DomainError {
	constructor(
		public readonly context: string,
		public readonly attempts: number,
		public readonly max: number,
	) {
		super(`[${context}] retry limit exceeded: ${attempts}/${max}`);
	}
}
