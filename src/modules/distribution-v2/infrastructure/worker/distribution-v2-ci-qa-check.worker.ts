import { InjectRedis } from '@nestjs-modules/ioredis';
import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { DistributionV2CiService } from '../../application/distribution-v2-ci.service';
import { DistributionV2CiQaCheckJobPayload } from '../../application/distribution-v2-ci.types';
import { DistributionV2ConfigService } from '../../config/distribution-v2.config.service';
import { distributionV2ConnectionOptions } from '../queue/distribution-v2.queue.service';

@Injectable()
export class DistributionV2CiQaCheckWorker
	implements OnModuleInit, OnModuleDestroy
{
	private readonly logger = new Logger(DistributionV2CiQaCheckWorker.name);
	private worker: Worker | null = null;

	constructor(
		@InjectRedis() private readonly redis: Redis,
		private readonly config: DistributionV2ConfigService,
		private readonly pipeline: DistributionV2CiService,
	) {}

	onModuleInit(): void {
		if (!this.config.isEnabled()) {
			this.logger.log(
				'Distribution-v2 is disabled; ci-qa-check worker is idle',
			);
			return;
		}
		this.worker = new Worker(
			`${this.config.getQueuePrefix()}.ci-qa-check`,
			async (job: Job<DistributionV2CiQaCheckJobPayload>) => {
				try {
					return await this.pipeline.handleQaCheck(job.data);
				} catch (error) {
					const finalAttempt =
						job.attemptsMade + 1 >= (job.opts.attempts ?? 3);
					if (!finalAttempt) throw error;
					return this.pipeline.recordTechnicalFailure(
						job.data,
						'CI_QA_CHECK',
						error instanceof Error
							? error
							: new Error(String(error)),
					);
				}
			},
			{
				connection: distributionV2ConnectionOptions(this.redis),
				concurrency: this.config.getWorkerConcurrency(),
				autorun: true,
			},
		);
		this.worker.on('failed', (job, error) => {
			this.logger.error(
				`CI QA check job ${job?.id ?? '<unknown>'} failed: ${error.message}`,
				error.stack,
			);
		});
		this.logger.log(
			`Started ${this.config.getQueuePrefix()}.ci-qa-check worker`,
		);
	}

	async onModuleDestroy(): Promise<void> {
		if (this.worker) await this.worker.close();
		this.worker = null;
	}
}
