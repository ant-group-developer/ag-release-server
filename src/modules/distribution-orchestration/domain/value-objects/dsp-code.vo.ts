import { InvariantViolationError } from '../errors/domain-errors';

/**
 * DspCode — a DSP code (SPOTIFY, VEVO, CI…). Normalized to UPPER, only [A-Z0-9_].
 * Matches the `code` column on `Dsp`/`Aggregator` (already UPPER in the real data).
 */
export class DspCode {
	private constructor(public readonly value: string) {}

	static create(raw: string): DspCode {
		const v = raw.trim().toUpperCase();
		if (!/^[A-Z0-9_]+$/.test(v)) {
			throw new InvariantViolationError('DspCode', `invalid: ${raw}`);
		}
		return new DspCode(v);
	}

	equals(o: DspCode): boolean {
		return this.value === o.value;
	}
}
