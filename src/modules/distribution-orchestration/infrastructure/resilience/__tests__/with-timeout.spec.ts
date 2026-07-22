import { TimeoutError, withTimeout } from '../with-timeout';

describe('withTimeout', () => {
	it('resolve trước deadline → trả kết quả', async () => {
		await expect(
			withTimeout(Promise.resolve(42), 1000, 'fast'),
		).resolves.toBe(42);
	});

	it('vượt deadline → TimeoutError', async () => {
		const slow = new Promise((r) => setTimeout(r, 100));
		await expect(withTimeout(slow, 10, 'slow')).rejects.toBeInstanceOf(
			TimeoutError,
		);
	});

	it('work reject → propagate lỗi gốc (không nuốt)', async () => {
		await expect(
			withTimeout(Promise.reject(new Error('inner')), 1000, 'err'),
		).rejects.toThrow('inner');
	});
});
