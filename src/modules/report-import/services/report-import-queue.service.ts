import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class ReportImportQueueService {
  private readonly logger = new Logger(ReportImportQueueService.name);
  private readonly QUEUE_NAME = 'report_import_queue';
  private readonly PROCESSING_QUEUE_NAME = 'report_import_queue_processing';

  constructor(@InjectRedis() private readonly redis: Redis) {}

  /**
   * Push a jobId to the import queue
   */
  async pushJob(jobId: string): Promise<void> {
    this.logger.log(`Enqueueing job ${jobId} to Redis queue: ${this.QUEUE_NAME}...`);
    const len = await this.redis.lpush(this.QUEUE_NAME, jobId);
    this.logger.log(`Successfully enqueued job ${jobId}. Queue length is now: ${len}`);
  }

  /**
   * Pop a jobId from the import queue and place it in the processing queue
   * (Reliable Queue Pattern via RPOPLPUSH)
   */
  async popJob(): Promise<string | null> {
    const jobId = await this.redis.rpoplpush(this.QUEUE_NAME, this.PROCESSING_QUEUE_NAME);
    if (jobId) {
      this.logger.log(`Popped job ${jobId} from ${this.QUEUE_NAME} to ${this.PROCESSING_QUEUE_NAME}`);
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
    const stuckJobs = await this.redis.lrange(this.PROCESSING_QUEUE_NAME, 0, -1);
    if (stuckJobs.length > 0) {
      this.logger.warn(`Found ${stuckJobs.length} stuck jobs in processing queue. Redelivering...`);
      for (const jobId of stuckJobs) {
        await this.nackJob(jobId);
      }
    }
  }
}
