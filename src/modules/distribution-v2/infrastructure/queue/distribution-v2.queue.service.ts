import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConnectionOptions, JobsOptions, Queue } from 'bullmq';
import Redis from 'ioredis';
import { DistributionV2ConfigService } from '../../config/distribution-v2.config.service';

export const DISTRIBUTION_V2_QUEUE_NAMES = [
	'orchestrate',
	'validate',
	'provision-id',
	'sync-source-id',
	'build-package',
	'sftp-upload',
	'ci-import-check',
	'ci-qa-check',
	'export-batch',
	'ci-tool-status',
	'state51-email',
	'delivery-status-sync',
] as const;

export type DistributionV2QueueName =
	(typeof DISTRIBUTION_V2_QUEUE_NAMES)[number];

function connectionOptions(redis: Redis): ConnectionOptions {
	const options = redis.options;
	return {
		host: options.host,
		port: options.port,
		password: options.password,
		db: options.db,
	};
}

@Injectable()
export class DistributionV2QueueService implements OnModuleDestroy {
	private readonly logger = new Logger(DistributionV2QueueService.name);
	private readonly queues = new Map<string, Queue>();
	private readonly connection: ConnectionOptions;

	constructor(
		@InjectRedis() redis: Redis,
		private readonly config: DistributionV2ConfigService,
	) {
		this.connection = connectionOptions(redis);
	}

	getQueue(name: DistributionV2QueueName): Queue {
		const queueName = `${this.config.getQueuePrefix()}.${name}`;
		const existing = this.queues.get(queueName);
		if (existing) return existing;

		const queue = new Queue(queueName, {
			connection: this.connection,
		});
		this.queues.set(queueName, queue);
		return queue;
	}

	async add(
		name: DistributionV2QueueName,
		data: Record<string, unknown>,
		options?: JobsOptions,
	): Promise<void> {
		await this.getQueue(name).add(name, data, options);
	}

	async onModuleDestroy(): Promise<void> {
		const names = [...this.queues.keys()];
		await Promise.all(
			[...this.queues.values()].map((queue) => queue.close()),
		);
		this.queues.clear();
		if (names.length > 0) {
			this.logger.log(`Closed ${names.length} distribution-v2 queues`);
		}
	}
}
