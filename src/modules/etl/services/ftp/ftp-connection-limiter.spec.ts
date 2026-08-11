import { FtpConnectionLimiter } from './ftp.service';

/**
 * The limiter replaced a Redis mutex whose worst failure was a hung holder
 * blocking every other caller with `Another FTP operation is already running`.
 * These tests pin the properties that made the swap safe: the cap is honoured,
 * waiters are served in order, a failed acquire never leaks its slot, and a
 * queued caller cannot wait forever.
 */
describe('FtpConnectionLimiter', () => {
	const flush = () => new Promise((resolve) => setImmediate(resolve));

	it('hands out slots up to the cap without waiting', async () => {
		const limiter = new FtpConnectionLimiter(3, 60_000);

		await limiter.acquire('a');
		await limiter.acquire('b');
		await limiter.acquire('c');

		expect(limiter.activeCount).toBe(3);
		expect(limiter.waitingCount).toBe(0);
	});

	it('makes the fourth caller wait until a slot is released', async () => {
		const limiter = new FtpConnectionLimiter(3, 60_000);
		const first = await limiter.acquire('a');
		await limiter.acquire('b');
		await limiter.acquire('c');

		let fourthAcquired = false;
		const fourth = limiter.acquire('d').then((release) => {
			fourthAcquired = true;
			return release;
		});

		await flush();
		expect(fourthAcquired).toBe(false);
		expect(limiter.waitingCount).toBe(1);

		first();
		await fourth;

		expect(fourthAcquired).toBe(true);
		// The released slot moved to the waiter rather than being freed and
		// re-taken, so the process never exceeds the cap.
		expect(limiter.activeCount).toBe(3);
		expect(limiter.waitingCount).toBe(0);
	});

	it('serves waiters in FIFO order', async () => {
		const limiter = new FtpConnectionLimiter(1, 60_000);
		const first = await limiter.acquire('holder');
		const order: string[] = [];

		const second = limiter.acquire('second').then((release) => {
			order.push('second');
			return release;
		});
		await flush();
		const third = limiter.acquire('third').then((release) => {
			order.push('third');
			return release;
		});
		await flush();

		first();
		(await second)();
		await third;

		expect(order).toEqual(['second', 'third']);
	});

	it('never exceeds the cap while a queue drains', async () => {
		const limiter = new FtpConnectionLimiter(3, 60_000);
		let peak = 0;
		const work = Array.from({ length: 10 }, () =>
			(async () => {
				const release = await limiter.acquire('worker');
				peak = Math.max(peak, limiter.activeCount);
				await flush();
				release();
			})(),
		);

		await Promise.all(work);

		expect(peak).toBe(3);
		expect(limiter.activeCount).toBe(0);
	});

	it('returns the slot when the work behind it fails', async () => {
		const limiter = new FtpConnectionLimiter(1, 60_000);
		const release = await limiter.acquire('doomed');

		try {
			throw new Error('connect failed');
		} catch {
			release();
		}

		expect(limiter.activeCount).toBe(0);
		await expect(limiter.acquire('next')).resolves.toBeInstanceOf(Function);
	});

	it('ignores a repeated release so a double free cannot inflate the pool', async () => {
		const limiter = new FtpConnectionLimiter(2, 60_000);
		const release = await limiter.acquire('a');

		release();
		release();

		expect(limiter.activeCount).toBe(0);
	});

	it('gives up waiting instead of blocking a caller forever', async () => {
		const limiter = new FtpConnectionLimiter(1, 20);
		await limiter.acquire('holder');

		await expect(limiter.acquire('latecomer')).rejects.toThrow(
			/Timed out after 20ms waiting for a free FTP connection slot \[latecomer\]/,
		);
		// The abandoned waiter leaves the queue, so it cannot silently swallow a
		// slot that is released later.
		expect(limiter.waitingCount).toBe(0);
	});

	it('does not hand a slot to a waiter that already timed out', async () => {
		const limiter = new FtpConnectionLimiter(1, 20);
		const release = await limiter.acquire('holder');

		await expect(limiter.acquire('latecomer')).rejects.toThrow(/Timed out/);
		release();

		expect(limiter.activeCount).toBe(0);
		await expect(limiter.acquire('next')).resolves.toBeInstanceOf(Function);
		expect(limiter.activeCount).toBe(1);
	});
});
