import { InjectRedis } from '@nestjs-modules/ioredis';
import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { DistributionV2ProvisioningService } from '../../application/distribution-v2-provisioning.service';
import { DistributionV2ProvisionIdJobPayload } from '../../application/distribution-v2-provisioning.types';
import { DistributionV2ConfigService } from '../../config/distribution-v2.config.service';
import { distributionV2ConnectionOptions } from '../queue/distribution-v2.queue.service';

@Injectable()
export class DistributionV2ProvisionIdWorker
	implements OnModuleInit, OnModuleDestroy
{
	private readonly logger = new Logger(DistributionV2ProvisionIdWorker.name);
	private worker: Worker | null = null;
	private sourceSyncWorker: Worker | null = null;

	constructor(
		@InjectRedis() private readonly redis: Redis,
		private readonly config: DistributionV2ConfigService,
		private readonly provisioning: DistributionV2ProvisioningService,
	) {}

	onModuleInit(): void {
		if (!this.config.isEnabled()) {
			this.logger.log(
				'Distribution-v2 is disabled; provision-id worker is idle',
			);
			return;
		}

		this.worker = new Worker(
			`${this.config.getQueuePrefix()}.provision-id`,
			async (job: Job) =>
				this.provisioning.handle(
					job.data as DistributionV2ProvisionIdJobPayload,
				),
			{
				connection: distributionV2ConnectionOptions(this.redis),
				concurrency: this.config.getWorkerConcurrency(),
				/**
				 * The application-level external_operation row is the source of
				 * truth. BullMQ retries are deliberately finite; an exhausted
				 * job remains observable in BullMQ and can be retried explicitly.
				 */
				autorun: true,
			},
		);
		this.sourceSyncWorker = new Worker(
			`${this.config.getQueuePrefix()}.sync-source-id`,
			async (job: Job) =>
				this.provisioning.syncSourceIdentifiers(
					job.data as DistributionV2ProvisionIdJobPayload,
				),
			{
				connection: distributionV2ConnectionOptions(this.redis),
				concurrency: this.config.getWorkerConcurrency(),
				autorun: true,
			},
		);
		this.worker.on('completed', (job) => {
			this.logger.debug(
				`Completed provision-id job ${job.id ?? '<unknown>'}`,
			);
		});
		this.worker.on('failed', (job, error) => {
			this.logger.error(
				`Provision-id job ${job?.id ?? '<unknown>'} failed: ${error.message}`,
				error.stack,
			);
		});
		this.sourceSyncWorker.on('failed', (job, error) => {
			this.logger.error(
				`Source identifier sync job ${job?.id ?? '<unknown>'} failed: ${error.message}`,
				error.stack,
			);
		});
		this.logger.log(
			`Started ${this.config.getQueuePrefix()}.provision-id worker`,
		);
	}

	async onModuleDestroy(): Promise<void> {
		if (this.worker) await this.worker.close();
		if (this.sourceSyncWorker) await this.sourceSyncWorker.close();
		this.worker = null;
		this.sourceSyncWorker = null;
	}
}
