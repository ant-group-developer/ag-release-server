import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class ExportQueueService {
  private readonly logger = new Logger(ExportQueueService.name);
  private readonly QUEUE_NAME = 'analytics_export_queue';
  private readonly PROCESSING_SET = 'analytics_export_processing';

  constructor(@InjectRedis() private readonly redis: Redis) {}

  async enqueue(jobId: string): Promise<void> {
    if (await this.hasJob(jobId)) {
      this.logger.log(`Export job ${jobId} already queued or processing. Skipping.`);
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
      this.logger.log(
        `Dequeued export job ${jobId} → processing`,
      );
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
