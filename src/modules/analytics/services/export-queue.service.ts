import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class ExportQueueService {
	private readonly logger = new Logger(ExportQueueService.name);
	private readonly QUEUE_NAME = 'analytics_export_queue';
	private readonly PROCESSING_SET = 'analytics_export_processing';
	/** Retry khi worker dequeue trước lúc row ClickHouse visible. */
	private readonly MISSING_ROW_ATTEMPTS_HASH =
		'analytics_export_missing_row_attempts';
	/** Retry của cron reaper cho job QUEUED bị mất khỏi Redis. */
	private readonly REQUEUE_ATTEMPTS_HASH =
		'analytics_export_requeue_attempts';

	constructor(@InjectRedis() private readonly redis: Redis) {}

	async enqueue(jobId: string): Promise<void> {
		if (await this.hasJob(jobId)) {
			this.logger.log(
				`Export job ${jobId} already queued or processing. Skipping.`,
			);
			return;
		}
		const len = await this.redis.lpush(this.QUEUE_NAME, jobId);
		this.logger.log(`Enqueued export job ${jobId}. Queue length: ${len}`);
	}

	async dequeue(): Promise<string | null> {
		const jobId = await this.redis.rpoplpush(
			this.QUEUE_NAME,
			this.PROCESSING_SET,
		);
		if (jobId) {
			this.logger.log(`Dequeued export job ${jobId} → processing`);
		}
		return jobId || null;
	}

	async ack(jobId: string): Promise<void> {
		await this.redis.lrem(this.PROCESSING_SET, 0, jobId);
	}

	async nack(jobId: string): Promise<void> {
		await this.redis.lrem(this.PROCESSING_SET, 0, jobId);
		await this.redis.lpush(this.QUEUE_NAME, jobId);
	}

	/**
	 * Worker dequeue được jobId nhưng chưa đọc được row từ ClickHouse → nack +
	 * backoff thay vì ack im lặng. Counter riêng, KHÔNG dùng chung với reaper:
	 * hai luồng có ngưỡng khác nhau, chung counter sẽ fail oan.
	 * TTL 1 ngày để hash tự dọn.
	 */
	async incrementMissingRowAttempt(jobId: string): Promise<number> {
		return this.bumpCounter(this.MISSING_ROW_ATTEMPTS_HASH, jobId);
	}

	async clearMissingRowAttempts(jobId: string): Promise<void> {
		await this.redis.hdel(this.MISSING_ROW_ATTEMPTS_HASH, jobId);
	}

	/** Số lần reaper đã re-enqueue một job QUEUED orphan. */
	async incrementRequeueAttempt(jobId: string): Promise<number> {
		return this.bumpCounter(this.REQUEUE_ATTEMPTS_HASH, jobId);
	}

	async clearRequeueAttempts(jobId: string): Promise<void> {
		await this.redis.hdel(this.REQUEUE_ATTEMPTS_HASH, jobId);
	}

	private async bumpCounter(hash: string, jobId: string): Promise<number> {
		const attempts = await this.redis.hincrby(hash, jobId, 1);
		await this.redis.expire(hash, 86_400);
		return attempts;
	}

	/** Job đang nằm trong queue hoặc processing set? Dùng cho reaper phát hiện orphan. */
	async isTracked(jobId: string): Promise<boolean> {
		return this.hasJob(jobId);
	}

	async hasJob(jobId: string): Promise<boolean> {
		const [queued, processing] = await Promise.all([
			this.redis.lrange(this.QUEUE_NAME, 0, -1),
			this.redis.lrange(this.PROCESSING_SET, 0, -1),
		]);
		return queued.includes(jobId) || processing.includes(jobId);
	}

	async getActiveCount(): Promise<number> {
		return this.redis.llen(this.PROCESSING_SET);
	}

	async getQueueLength(): Promise<number> {
		return this.redis.llen(this.QUEUE_NAME);
	}

	async redeliverStuck(): Promise<void> {
		const stuck = await this.redis.lrange(this.PROCESSING_SET, 0, -1);
		if (stuck.length > 0) {
			this.logger.warn(
				`Found ${stuck.length} stuck export jobs. Redelivering...`,
			);
			for (const jobId of stuck) {
				await this.nack(jobId);
			}
		}
	}
}
