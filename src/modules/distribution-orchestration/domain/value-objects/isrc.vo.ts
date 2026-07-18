import { InvariantViolationError } from '../errors/domain-errors';

export class Isrc {
	private constructor(public readonly value: string) {}
	static create(raw: string): Isrc {
		const v = raw.trim().toUpperCase().replace(/-/g, '');
		// ISRC: CC-XXX-YY-NNNNN → 12 chars after removing dashes
		// (2 country letters + 3 alphanumeric registrant + 2 year digits + 5 designation digits)
		if (!/^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/.test(v)) {
			throw new InvariantViolationError('Isrc', `invalid: ${raw}`);
		}
		return new Isrc(v);
	}
	equals(o: Isrc): boolean {
		return this.value === o.value;
	}
}
