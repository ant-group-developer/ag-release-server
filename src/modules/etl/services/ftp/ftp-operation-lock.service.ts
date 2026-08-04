import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

const LOCK_KEY = 'etl:ftp:exclusive-operation';
const LOCK_TTL_MS = 24 * 60 * 60 * 1000;

/** Prevents the scheduled FTP sync and rule-discovery scan from logging in concurrently. */
@Injectable()
export class FtpOperationLockService {
	private readonly logger = new Logger(FtpOperationLockService.name);

	constructor(@InjectRedis() private readonly redis: Redis) {}

	async tryAcquire(operation: string): Promise<string | null> {
		const token = `${operation}:${process.pid}:${Date.now()}:${Math.random()}`;
		const acquired = await this.redis.set(
			LOCK_KEY,
			token,
			'PX',
			LOCK_TTL_MS,
			'NX',
		);
		if (acquired === 'OK') return token;
		this.logger.warn(
			`Skipped ${operation}: another FTP operation is already running`,
		);
		return null;
	}

	async release(token: string): Promise<void> {
		await this.redis
			.eval(
				"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0",
				1,
				LOCK_KEY,
				token,
			)
			.catch((error) =>
				this.logger.warn(
					`Failed to release FTP operation lock: ${error.message}`,
				),
			);
	}
}
