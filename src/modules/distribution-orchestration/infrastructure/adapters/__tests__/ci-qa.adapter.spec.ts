import { IdempotencyKey } from '../../../domain/value-objects/idempotency-key.vo';
import { CiQaApiService } from '../../ci-api/ci-qa-api.service';
import { CiQaAdapter } from '../ci-qa.adapter';
import { CircuitBreakerOpenError } from '../../resilience/circuit-breaker';

/**
 * CiQaAdapter — Khối D resilience: circuit breaker.
 * Focus: mạch mở sau 5 lỗi liên tiếp (fail-fast) + 404 KHÔNG tính lỗi mạch (nghiệp vụ).
 */
describe('CiQaAdapter (circuit breaker)', () => {
	let adapter: CiQaAdapter;
	let api: jest.Mocked<CiQaApiService>;

	const key = IdempotencyKey.create('qa:dist-1:ch-1');
	const call = () => adapter.check({ upc: '0850080651804', key });

	beforeEach(() => {
		api = {
			getReleaseIdByUpc: jest.fn(),
			getQaFlags: jest.fn(),
		} as any;
		adapter = new CiQaAdapter(api);
	});

	it('returns clean when release not found (null)', async () => {
		api.getReleaseIdByUpc.mockResolvedValue(null as any);
		await expect(call()).resolves.toEqual({ kind: 'clean' });
	});

	it('returns clean on blocking-free flags', async () => {
		api.getReleaseIdByUpc.mockResolvedValue('ci-rel-1' as any);
		api.getQaFlags.mockResolvedValue({
			warningFlags: [],
			blockingFlags: [],
			hasBlockingFlags: false,
		} as any);
		await expect(call()).resolves.toEqual({ kind: 'clean' });
	});

	it('opens breaker after 5 consecutive failures → fail-fast', async () => {
		api.getReleaseIdByUpc.mockRejectedValue(new Error('CI down'));

		// 5 lỗi thật → trip mạch.
		for (let i = 0; i < 5; i++) {
			await expect(call()).rejects.toThrow('CI down');
		}
		// Lần 6: mạch OPEN → fail-fast, KHÔNG gọi API nữa.
		const before = api.getReleaseIdByUpc.mock.calls.length;
		await expect(call()).rejects.toBeInstanceOf(CircuitBreakerOpenError);
		expect(api.getReleaseIdByUpc.mock.calls.length).toBe(before);
	});

	it('404 does NOT count as breaker failure (business not-found)', async () => {
		const notFound = { response: { status: 404 } };
		api.getReleaseIdByUpc.mockRejectedValue(notFound);

		// 10 lần 404 → vẫn clean, mạch KHÔNG mở (không bao giờ fail-fast).
		for (let i = 0; i < 10; i++) {
			await expect(call()).resolves.toEqual({ kind: 'clean' });
		}
		expect(api.getReleaseIdByUpc).toHaveBeenCalledTimes(10);
	});
});
