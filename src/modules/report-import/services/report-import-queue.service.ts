import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import Redis from 'ioredis';

@Injectable()
export class ReportImportQueueService {
	private readonly logger = new Logger(ReportImportQueueService.name);
	private readonly QUEUE_NAME = 'report_import_queue';
	private readonly PROCESSING_QUEUE_NAME = 'report_import_queue_processing';

	constructor(@InjectRedis() private readonly redis: Redis) {}

	async invalidateAnalyticsCache(): Promise<void> {
		await this.redis.publish('analytics:invalidate', 'report-import');
	}

	/** Serialize replacements through metadata/cube completion across worker processes. */
	async acquireImportLocks(identities: string[]): Promise<{
		assertHeld: () => Promise<void>;
		release: () => Promise<void>;
	}> {
		const keys = [...new Set(identities)]
			.sort()
			.map(
				(id) =>
					`report-import:lock:${createHash('sha256').update(id).digest('hex')}`,
			);
		const token = randomUUID(),
			acquired: string[] = [];
		const ttl = 120_000;
		let lost = false;
		const renew = async () => {
			for (const key of acquired) {
				const ok = await this.redis.eval(
					"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
					1,
					key,
					token,
					ttl,
				);
				if (!ok) lost = true;
			}
		};
		const timer = setInterval(() => {
			void renew().catch(() => {
				lost = true;
			});
		}, 30_000);
		timer.unref();
		const release = async () => {
			clearInterval(timer);
			await Promise.all(
				acquired.map((key) =>
					this.redis.eval(
						"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
						1,
						key,
						token,
					),
				),
			);
		};
		try {
			const deadline = Date.now() + 10 * 60_000;
			for (const key of keys) {
				while (
					(await this.redis.set(key, token, 'PX', ttl, 'NX')) !== 'OK'
				) {
					if (lost || Date.now() > deadline)
						throw new Error(
							'Timed out waiting for another import of the same file',
						);
					await new Promise((resolve) => setTimeout(resolve, 1000));
				}
				acquired.push(key);
			}
			return {
				assertHeld: async () => {
					await renew();
					if (lost)
						throw new Error(
							'Report import lock lost; retry the job',
						);
				},
				release,
			};
		} catch (error) {
			await release();
			throw error;
		}
	}

	/**
	 * Push a jobId to the import queue
	 */
	async pushJob(jobId: string): Promise<void> {
		if (await this.hasJob(jobId)) {
			this.logger.log(
				`Job ${jobId} is already queued or processing. Skip duplicate enqueue.`,
			);
			return;
		}

		this.logger.log(
			`Enqueueing job ${jobId} to Redis queue: ${this.QUEUE_NAME}...`,
		);
		const len = await this.redis.lpush(this.QUEUE_NAME, jobId);
		this.logger.log(
			`Successfully enqueued job ${jobId}. Queue length is now: ${len}`,
		);
	}

	async hasJob(jobId: string): Promise<boolean> {
		const [queued, processing] = await Promise.all([
			this.redis.lrange(this.QUEUE_NAME, 0, -1),
			this.redis.lrange(this.PROCESSING_QUEUE_NAME, 0, -1),
		]);

		return queued.includes(jobId) || processing.includes(jobId);
	}

	/**
	 * Pop a jobId from the import queue and place it in the processing queue
	 * (Reliable Queue Pattern via RPOPLPUSH)
	 */
	async popJob(): Promise<string | null> {
		const jobId = await this.redis.rpoplpush(
			this.QUEUE_NAME,
			this.PROCESSING_QUEUE_NAME,
		);
		if (jobId) {
			this.logger.log(
				`Popped job ${jobId} from ${this.QUEUE_NAME} to ${this.PROCESSING_QUEUE_NAME}`,
			);
		}
		return jobId || null;
	}

	/**
	 * Acknowledge successful completion of a job by removing it from the processing queue
	 */
	async ackJob(jobId: string): Promise<void> {
		await this.redis.lrem(this.PROCESSING_QUEUE_NAME, 0, jobId);
	}

	/**
	 * Nack a job (e.g. on worker crash/failure) by putting it back to the main queue
	 */
	async nackJob(jobId: string): Promise<void> {
		await this.redis.lrem(this.PROCESSING_QUEUE_NAME, 0, jobId);
		await this.redis.lpush(this.QUEUE_NAME, jobId);
	}

	/**
	 * Redeliver stuck jobs from processing queue back to main queue
	 * (Call this on application startup or worker initialization)
	 */
	async redeliverStuckJobs(): Promise<void> {
		const stuckJobs = await this.redis.lrange(
			this.PROCESSING_QUEUE_NAME,
			0,
			-1,
		);
		if (stuckJobs.length > 0) {
			this.logger.warn(
				`Found ${stuckJobs.length} stuck jobs in processing queue. Redelivering...`,
			);
			for (const jobId of stuckJobs) {
				await this.nackJob(jobId);
			}
		}
	}
}
