import {
	DeliveryProcess,
	StageKind,
	validateProcess,
} from '../channel-delivery/delivery-process';
import {
	CI_DEAL_INITIAL,
	CI_TAKEDOWN,
	getProcess,
	hasProcess,
	SPOTIFY_INITIAL,
} from '../channel-delivery/delivery-process.registry';
import { InvariantViolationError } from '../errors/domain-errors';

describe('validateProcess (INV-C8)', () => {
	it('accepts a well-formed process', () => {
		expect(() => validateProcess(SPOTIFY_INITIAL)).not.toThrow();
		expect(() => validateProcess(CI_DEAL_INITIAL)).not.toThrow();
		expect(() => validateProcess(CI_TAKEDOWN)).not.toThrow();
	});

	it('rejects empty stages', () => {
		const p: DeliveryProcess = { code: 'x', stages: [] };
		expect(() => validateProcess(p)).toThrow(InvariantViolationError);
	});

	it('rejects WAIT stage without waitKind', () => {
		const p: DeliveryProcess = {
			code: 'x',
			stages: [{ key: 'w', kind: StageKind.WAIT }],
		};
		expect(() => validateProcess(p)).toThrow(/missing waitKind/);
	});

	it('rejects duplicate stage keys', () => {
		const p: DeliveryProcess = {
			code: 'x',
			stages: [
				{ key: 'deliver', kind: StageKind.ACTION },
				{ key: 'deliver', kind: StageKind.ACTION },
			],
		};
		expect(() => validateProcess(p)).toThrow(/duplicate stage key/);
	});
});

describe('registry', () => {
	it('resolves known process by code', () => {
		expect(getProcess('spotify.initial').code).toBe('spotify.initial');
		expect(hasProcess('ci.deal.initial')).toBe(true);
	});
	it('throws on unknown code', () => {
		expect(() => getProcess('nope.404')).toThrow(InvariantViolationError);
		expect(hasProcess('nope.404')).toBe(false);
	});
});
