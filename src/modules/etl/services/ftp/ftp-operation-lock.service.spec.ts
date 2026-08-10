import { FtpOperationLockService } from './ftp-operation-lock.service';

describe('FtpOperationLockService', () => {
	const redis = {
		set: jest.fn(),
		eval: jest.fn(),
	};
	let service: FtpOperationLockService;

	beforeEach(() => {
		jest.clearAllMocks();
		service = new FtpOperationLockService(redis as any);
	});

	it('uses a short lease instead of a day-long crash lock', async () => {
		redis.set.mockResolvedValue('OK');

		await service.tryAcquire('auto-sync');

		expect(redis.set).toHaveBeenCalledWith(
			'etl:ftp:exclusive-operation',
			expect.stringMatching(/^auto-sync:/),
			'PX',
			2 * 60 * 1000,
			'NX',
		);
	});

	it('renews only when this owner still holds the lock', async () => {
		redis.eval.mockResolvedValue(1);

		await expect(service.renew('owner-token')).resolves.toBe(true);
		expect(redis.eval).toHaveBeenCalledWith(
			expect.stringContaining("redis.call('pexpire'"),
			1,
			'etl:ftp:exclusive-operation',
			'owner-token',
			'120000',
		);

		redis.eval.mockResolvedValue(0);
		await expect(service.renew('owner-token')).resolves.toBe(false);
	});
});
