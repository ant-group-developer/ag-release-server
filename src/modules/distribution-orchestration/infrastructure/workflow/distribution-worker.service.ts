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
	JobPayload,
	QUEUES,
	QueueName,
	WORKFLOW_ENGINE,
	WorkflowEnginePort,
} from '../../application/ports/workflow-engine.port';
import { REPOLL_DELAY_MS } from './repoll-delay.config';
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
	 * Process job: dispatch → runner/handler → enqueue command HOẶC re-poll.
	 *
	 * Trả về từ dispatch:
	 *   · `dist.orchestrate` → LUÔN null (handler đã persist state) → không làm gì thêm.
	 *   · runner queue trả command → enqueue lại vào `dist.orchestrate`.
	 *   · runner queue trả null → bước WAIT còn 'pending' → RE-POLL: enqueue lại chính
	 *     queue đó với delayMs (nhả worker ngay, BullMQ đánh thức sau). KHÔNG block.
	 */
	private async processJob(
		queue: QueueName,
		payload: JobPayload,
	): Promise<void> {
		const command = await this.dispatchMap.dispatch(queue, payload);

		// dist.orchestrate: handler tự persist, không trả command → xong.
		if (queue === QUEUES.ORCHESTRATE) return;

		// Runner trả null = chưa có kết quả (WAIT pending) → re-poll cùng queue.
		if (!command) {
			await this.repoll(queue, payload);
			return;
		}

		// Runner trả command → enqueue lại vào dist.orchestrate.
		const opts: EnqueueOptions = {
			jobId: `${command.distributionId}:${command.type}:${command.key}`,
			attempts: 3, // Default retry; Khối D map theo RetryPolicy
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

	/**
	 * Re-poll: enqueue lại queue hiện tại sau delayMs.
	 *
	 * jobId phải KHÁC nhau mỗi lần poll — nếu giữ nguyên jobId, BullMQ dedupe sẽ
	 * chặn lần re-enqueue kế → job kẹt. Dùng attempt counter trong key.
	 */
	private async repoll(queue: QueueName, payload: JobPayload): Promise<void> {
		const attempt = (payload.pollAttempt ?? 0) + 1;
		const delayMs = REPOLL_DELAY_MS(queue);

		await this.workflowEngine.enqueue(
			queue,
			{ ...payload, pollAttempt: attempt },
			{
				jobId: `${payload.distributionId}:${queue}:poll-${attempt}:${payload.key}`,
				delayMs,
			},
		);
	}
}
