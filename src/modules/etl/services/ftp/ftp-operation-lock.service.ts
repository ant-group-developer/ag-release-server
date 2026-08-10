import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

const LOCK_KEY = 'etl:ftp:exclusive-operation';
const LOCK_TTL_MS = 2 * 60 * 1000;
const LOCK_HEARTBEAT_MS = 30 * 1000;

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

	/**
	 * Waits for the lock instead of skipping immediately. Use for user-triggered
	 * work, where a silent skip reads as nothing having happened; background jobs
	 * should keep using tryAcquire and drop the run. The default wait exceeds one
	 * full lease so a manual retry immediately after a process crash can acquire
	 * the abandoned lock instead of being incorrectly marked failed after 30s.
	 */
	async tryAcquireWithWait(
		operation: string,
		{ maxWaitMs = LOCK_TTL_MS + 10_000, pollIntervalMs = 2_000 } = {},
	): Promise<string | null> {
		const deadline = Date.now() + maxWaitMs;
		for (;;) {
			const token = `${operation}:${process.pid}:${Date.now()}:${Math.random()}`;
			const acquired = await this.redis.set(
				LOCK_KEY,
				token,
				'PX',
				LOCK_TTL_MS,
				'NX',
			);
			if (acquired === 'OK') return token;
			if (Date.now() + pollIntervalMs >= deadline) {
				this.logger.warn(
					`Gave up waiting ${maxWaitMs}ms for the FTP lock on behalf of ${operation}`,
				);
				return null;
			}
			await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
		}
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

	/**
	 * Extends the lease only when this process still owns it. A crashed worker
	 * stops heartbeating, so its lock disappears quickly instead of blocking FTP
	 * work for a full day after restart.
	 */
	async renew(token: string): Promise<boolean> {
		const result = await this.redis.eval(
			"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) end return 0",
			1,
			LOCK_KEY,
			token,
			String(LOCK_TTL_MS),
		);
		return Number(result) === 1;
	}

	/** Starts a lightweight owner-checked lease heartbeat and returns its stopper. */
	startHeartbeat(token: string, operation: string): () => void {
		let renewing = false;
		const timer = setInterval(() => {
			if (renewing) return;
			renewing = true;
			void this.renew(token)
				.then((renewed) => {
					if (!renewed)
						this.logger.warn(
							`FTP lock lease was lost while ${operation} was running`,
						);
				})
				.catch((error) =>
					this.logger.warn(
						`Failed to renew FTP lock for ${operation}: ${error.message}`,
					),
				)
				.finally(() => {
					renewing = false;
				});
		}, LOCK_HEARTBEAT_MS);
		timer.unref();
		return () => clearInterval(timer);
	}
}
