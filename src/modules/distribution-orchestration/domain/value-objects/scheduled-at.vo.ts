import { InvariantViolationError } from '../errors/domain-errors';

/**
 * ScheduledAt — the moment to wake up a wait point (WAIT stage) or schedule a resume.
 *
 * The domain does NOT read the current time (`new Date()`) — that breaks purity + is hard to test.
 * `create(when, now)` takes `now` from a Clock port supplied by the caller → checks "not in the past".
 * The domain only HOLDS the moment; the actual scheduling belongs to the engine (phase 2).
 */
export class ScheduledAt {
	private constructor(public readonly value: Date) {}

	static create(when: Date, now: Date): ScheduledAt {
		if (Number.isNaN(when.getTime())) {
			throw new InvariantViolationError('ScheduledAt', 'invalid date');
		}
		if (when.getTime() < now.getTime()) {
			throw new InvariantViolationError('ScheduledAt', 'must not be in the past');
		}
		// copy for immutability: the caller mutating `when` later must not affect the VO
		return new ScheduledAt(new Date(when.getTime()));
	}

	get epochMs(): number {
		return this.value.getTime();
	}

	equals(o: ScheduledAt): boolean {
		return this.value.getTime() === o.value.getTime();
	}
}
