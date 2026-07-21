import { InjectRedis } from '@nestjs-modules/ioredis';
import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from '@nestjs/common';
import { ConnectionOptions, Worker } from 'bullmq';
import Redis from 'ioredis';

import { Inject } from '@nestjs/common';
import {
	EnqueueOptions,
	QUEUES,
	QueueName,
	WORKFLOW_ENGINE,
	WorkflowEnginePort,
} from '../../application/ports/workflow-engine.port';
import { RunnerDispatchMap } from './runner-dispatch-map';

/**
 * Extract BullMQ-compatible connection options from ioredis instance.
 */
function extractConnectionOpts(redis: Redis): ConnectionOptions {
	const opts = redis.options;
	return {
		host: opts.host ?? 'localhost',
		port: opts.port ?? 6379,
		password: opts.password,
		db: opts.db ?? 0,
		maxRetriesPerRequest: null,
	};
}

/**
 * DistributionWorkerService — khép vòng lặp orchestration qua BullMQ Worker.
 *
 * Phase 2 quyết định #33 hoãn Worker sang "Phase 4+". Phase 5 Khối A implement.
 *
 * Tạo 8 BullMQ Worker (1 worker/queue):
 *   - dist.orchestrate → gọi OrchestrateHandler.handle(payload.command)
 *   - dist.validate → ValidateRunner.run() → command
 *   - 7 runner queues → runner.run() → command | null
 *
 * Runner trả command → enqueue lại vào dist.orchestrate (không gọi handler trực tiếp).
 * Runner trả null → enqueue lại queue hiện tại với delay (re-poll).
 *
 * Lifecycle:
 *   - OnModuleInit: tạo 8 Worker, start consume
 *   - OnModuleDestroy: đóng tất cả Worker
 *
 * Concurrency: default 1 (sequential per queue). Khối D sẽ cấu hình per-queue.
 */
@Injectable()
export class DistributionWorkerService
	implements OnModuleInit, OnModuleDestroy
{
	private readonly logger = new Logger(DistributionWorkerService.name);
	private readonly workers: Worker[] = [];
	private readonly connectionOpts: ConnectionOptions;

	// 8 queues cần tạo Worker — derive từ QUEUES, không liệt kê tay để tránh lệch union
	private readonly queues: QueueName[] = Object.values(QUEUES);

	constructor(
		@InjectRedis() redis: Redis,
		@Inject(WORKFLOW_ENGINE)
		private readonly workflowEngine: WorkflowEnginePort,
		private readonly dispatchMap: RunnerDispatchMap,
	) {
		this.connectionOpts = extractConnectionOpts(redis);
	}

	async onModuleInit(): Promise<void> {
		this.logger.log('Starting Distribution Workers...');

		for (const queue of this.queues) {
			const worker = new Worker(
				queue,
				async (job) => this.processJob(queue, job.data),
				{
					connection: this.connectionOpts,
					concurrency: 1, // Khối D sẽ config per-queue
				},
			);

			// Error handlers
			worker.on('error', (err) => {
				this.logger.error(`Worker ${queue} error:`, err);
			});

			worker.on('failed', (job, err) => {
				this.logger.error(
					`Job ${job?.id} failed on ${queue}:`,
					err.message,
				);
			});

			this.workers.push(worker);
			this.logger.log(`Worker started: ${queue}`);
		}
	}

	async onModuleDestroy(): Promise<void> {
		this.logger.log('Stopping Distribution Workers...');
		await Promise.all(this.workers.map((w) => w.close()));
		this.workers.length = 0;
		this.logger.log('All workers stopped');
	}

	/**
	 * Process job: dispatch → runner/handler → enqueue command nếu có.
	 */
	private async processJob(queue: QueueName, payload: any): Promise<void> {
		const command = await this.dispatchMap.dispatch(queue, payload);

		if (!command) {
			// dist.orchestrate hoặc runner poll chưa có kết quả
			return;
		}

		// Runner trả command → enqueue lại vào dist.orchestrate
		const opts: EnqueueOptions = {
			jobId: `${payload.distributionId}:${command.type}:${command.key}`,
			attempts: 3, // Default retry; Khối D sẽ map theo RetryPolicy
		};

		await this.workflowEngine.enqueue(
			QUEUES.ORCHESTRATE,
			{
				distributionId: command.distributionId,
				correlationId: payload.correlationId,
				key: command.key,
				command, // Mang toàn bộ command vào payload
			},
			opts,
		);
	}
}
