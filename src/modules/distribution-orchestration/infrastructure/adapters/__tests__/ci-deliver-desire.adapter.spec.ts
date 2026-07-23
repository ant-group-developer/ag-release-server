import { DspCode } from '../../../domain/value-objects/dsp-code.vo';
import { CiDeliverDesireApiService } from '../../ci-api/ci-deliver-desire-api.service';
import { CiDeliverDesireAdapter } from '../ci-deliver-desire.adapter';
import { CircuitBreakerOpenError } from '../../resilience/circuit-breaker';

/**
 * CiDeliverDesireAdapter — Khối D resilience: circuit breaker.
 * Focus: mạch mở sau 5 lỗi liên tiếp (fail-fast) + 404 → all pending, KHÔNG tính lỗi mạch.
 */
describe('CiDeliverDesireAdapter (circuit breaker)', () => {
	let adapter: CiDeliverDesireAdapter;
	let api: jest.Mocked<CiDeliverDesireApiService>;

	const dspCodes = [DspCode.create('SPOTIFY'), DspCode.create('VEVO')];
	const call = () =>
		adapter.read({ upc: '0850080651804', dspCodes });

	beforeEach(() => {
		api = { getDeliverDesire: jest.fn() } as any;
		adapter = new CiDeliverDesireAdapter(api);
	});

	it('maps live status from CI response', async () => {
		api.getDeliverDesire.mockResolvedValue(
			new Map([
				['SPOTIFY', { status: 'complete', transferStatus: 'transferred' }],
			]) as any,
		);

		const result = await call();
		expect(result.get('SPOTIFY')).toBe('live');
		expect(result.get('VEVO')).toBe('pending'); // not in response
	});

	it('opens breaker after 5 consecutive failures → fail-fast', async () => {
		api.getDeliverDesire.mockRejectedValue(new Error('CI down'));

		for (let i = 0; i < 5; i++) {
			await expect(call()).rejects.toThrow('CI down');
		}
		const before = api.getDeliverDesire.mock.calls.length;
		await expect(call()).rejects.toBeInstanceOf(CircuitBreakerOpenError);
		expect(api.getDeliverDesire.mock.calls.length).toBe(before);
	});

	it('404 does NOT count as breaker failure → all pending', async () => {
		api.getDeliverDesire.mockRejectedValue({ response: { status: 404 } });

		for (let i = 0; i < 10; i++) {
			const result = await call();
			expect(result.get('SPOTIFY')).toBe('pending');
			expect(result.get('VEVO')).toBe('pending');
		}
		expect(api.getDeliverDesire).toHaveBeenCalledTimes(10);
	});
});
