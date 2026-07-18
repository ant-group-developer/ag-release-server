import { InvariantViolationError } from '../errors/domain-errors';

const UUID_V4 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * CorrelationId — an id carried across the queue/log/trace (observability §12).
 * Uses uuid v4. The domain does NOT generate it (needs an external random source) → it is passed in
 * via `create`, or supplied by the application. Format-validated to keep junk ids out of the timeline.
 */
export class CorrelationId {
	private constructor(public readonly value: string) {}

	static create(raw: string): CorrelationId {
		const v = raw.trim().toLowerCase();
		if (!UUID_V4.test(v)) {
			throw new InvariantViolationError(
				'CorrelationId',
				`invalid uuid v4: ${raw}`,
			);
		}
		return new CorrelationId(v);
	}

	equals(o: CorrelationId): boolean {
		return this.value === o.value;
	}
}
