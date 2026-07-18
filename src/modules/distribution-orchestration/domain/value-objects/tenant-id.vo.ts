import { InvariantViolationError } from '../errors/domain-errors';

/**
 * TenantId — a tenant identifier. The `requiresManualReview` flag does NOT live in this VO —
 * it is a transition input passed into `markValidated(...)` so the aggregate does not depend on the tenant table.
 * Accepts a uuid or a non-empty tenant code (not forced to uuid, since legacy tenants may use a slug).
 */
export class TenantId {
	private constructor(public readonly value: string) {}

	static create(raw: string): TenantId {
		const v = raw.trim();
		if (!v) {
			throw new InvariantViolationError('TenantId', 'empty');
		}
		return new TenantId(v);
	}

	equals(o: TenantId): boolean {
		return this.value === o.value;
	}
}
