import { InvariantViolationError } from '../errors/domain-errors';

export class Upc {
	private constructor(public readonly value: string) {}
	static create(raw: string): Upc {
		const v = raw.trim();
		// UPC/EAN: 12–14 digits (GTIN-12/13/14). Domain only validates the format, no check-digit here.
		if (!/^\d{12,14}$/.test(v)) {
			throw new InvariantViolationError('Upc', `invalid: ${raw}`);
		}
		return new Upc(v);
	}
	equals(o: Upc): boolean {
		return this.value === o.value;
	}
}
