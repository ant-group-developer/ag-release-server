import { InvariantViolationError } from '../errors/domain-errors';

/**
 * IdempotencyKey — each command/side-effect carries a key to prevent replay (§13).
 * Non-empty, ≤128 chars. The domain only holds + compares it; deciding "already done?" is the adapter/port's job.
 */
export class IdempotencyKey {
	private constructor(public readonly value: string) {}

	static create(raw: string): IdempotencyKey {
		const v = raw.trim();
		if (!v) {
			throw new InvariantViolationError('IdempotencyKey', 'empty');
		}
		if (v.length > 128) {
			throw new InvariantViolationError('IdempotencyKey', `too long: ${v.length} > 128`);
		}
		return new IdempotencyKey(v);
	}

	equals(o: IdempotencyKey): boolean {
		return this.value === o.value;
	}
}
