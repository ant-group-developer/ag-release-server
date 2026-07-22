import {
	CircuitBreaker,
	CircuitBreakerOpenError,
} from '../circuit-breaker';

describe('CircuitBreaker', () => {
	const opts = { name: 'test', failureThreshold: 3, cooldownMs: 1000 };
	const fail = () => Promise.reject(new Error('boom'));
	const ok = () => Promise.resolve('ok');

	it('closed: cho qua, thành công reset counter', async () => {
		const cb = new CircuitBreaker(opts);
		await expect(cb.execute(ok)).resolves.toBe('ok');
		expect(cb.getState()).toBe('closed');
	});

	it('mở mạch sau failureThreshold lỗi liên tiếp', async () => {
		const cb = new CircuitBreaker(opts);
		for (let i = 0; i < 3; i++) {
			await expect(cb.execute(fail)).rejects.toThrow('boom');
		}
		expect(cb.getState()).toBe('open');
	});

	it('open: fail-fast (CircuitBreakerOpenError), KHÔNG gọi work', async () => {
		const cb = new CircuitBreaker(opts);
		for (let i = 0; i < 3; i++) await cb.execute(fail).catch(() => {});

		const work = jest.fn(ok);
		await expect(cb.execute(work)).rejects.toBeInstanceOf(
			CircuitBreakerOpenError,
		);
		expect(work).not.toHaveBeenCalled();
	});

	it('thành công giữa chừng reset counter (không mở)', async () => {
		const cb = new CircuitBreaker(opts);
		await cb.execute(fail).catch(() => {});
		await cb.execute(fail).catch(() => {});
		await cb.execute(ok); // reset
		await cb.execute(fail).catch(() => {});
		expect(cb.getState()).toBe('closed');
	});

	it('half-open sau cooldown: thành công → closed', async () => {
		let clock = 0;
		const cb = new CircuitBreaker(opts, () => clock);
		for (let i = 0; i < 3; i++) await cb.execute(fail).catch(() => {});
		expect(cb.getState()).toBe('open');

		clock = 1001; // qua cooldown
		await expect(cb.execute(ok)).resolves.toBe('ok');
		expect(cb.getState()).toBe('closed');
	});

	it('half-open sau cooldown: lỗi → open lại ngay', async () => {
		let clock = 0;
		const cb = new CircuitBreaker(opts, () => clock);
		for (let i = 0; i < 3; i++) await cb.execute(fail).catch(() => {});

		clock = 1001;
		await expect(cb.execute(fail)).rejects.toThrow('boom');
		expect(cb.getState()).toBe('open');
	});
});
