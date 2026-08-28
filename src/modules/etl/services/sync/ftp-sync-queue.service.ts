import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class FtpSyncQueueService {
	private readonly logger = new Logger(FtpSyncQueueService.name);
	private readonly QUEUE_NAME = 'ftp_sync_queue';
	private readonly PROCESSING_QUEUE_NAME = 'ftp_sync_queue_processing';

	constructor(@InjectRedis() private readonly redis: Redis) {}

	async pushJob(jobId: string): Promise<void> {
		if (await this.hasJob(jobId)) {
			this.logger.log(
				`FTP sync job ${jobId} is already queued or processing. Skip duplicate enqueue.`,
			);
			return;
		}
		const len = await this.redis.lpush(this.QUEUE_NAME, jobId);
		this.logger.log(
			`Enqueued FTP sync job ${jobId}. Queue length is now: ${len}`,
		);
	}

	async hasJob(jobId: string): Promise<boolean> {
		const [queued, processing] = await Promise.all([
			this.redis.lrange(this.QUEUE_NAME, 0, -1),
			this.redis.lrange(this.PROCESSING_QUEUE_NAME, 0, -1),
		]);
		return queued.includes(jobId) || processing.includes(jobId);
	}

	async popJob(): Promise<string | null> {
		const jobId = await this.redis.rpoplpush(
			this.QUEUE_NAME,
			this.PROCESSING_QUEUE_NAME,
		);
		if (jobId) {
			this.logger.log(`Dequeued FTP sync job ${jobId} → processing`);
		}
		return jobId || null;
	}

	async ackJob(jobId: string): Promise<void> {
		await this.redis.lrem(this.PROCESSING_QUEUE_NAME, 0, jobId);
	}

	async nackJob(jobId: string): Promise<void> {
		await this.redis.lrem(this.PROCESSING_QUEUE_NAME, 0, jobId);
		await this.redis.lpush(this.QUEUE_NAME, jobId);
	}

	async redeliverStuckJobs(): Promise<void> {
		const stuckJobs = await this.redis.lrange(
			this.PROCESSING_QUEUE_NAME,
			0,
			-1,
		);
		if (stuckJobs.length === 0) return;
		this.logger.warn(
			`Found ${stuckJobs.length} stuck FTP sync job(s). Redelivering...`,
		);
		for (const jobId of stuckJobs) {
			await this.nackJob(jobId);
		}
	}
}
