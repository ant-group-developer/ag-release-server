import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConnectionOptions, Queue } from 'bullmq';
import Redis from 'ioredis';

import {
	EnqueueOptions,
	JobPayload,
	QueueName,
	WorkflowEnginePort,
} from '../../application/ports/workflow-engine.port';

/**
 * Sanitize jobId cho BullMQ — thay `:` thành `-`.
 *
 * BullMQ dùng `:` làm Redis key separator. jobId chứa `:` sẽ phá key structure.
 * Handler tạo jobId dạng `${distId}:${state}:${key}` — mapping 1-1 deterministic
 * nên dedupe vẫn hoạt động sau sanitize.
 *
 * Outbox DB giữ nguyên `:` (human-readable), chỉ BullMQ nhận `-`.
 */
function sanitizeJobId(jobId: string | undefined): string | undefined {
	if (!jobId) return undefined;
	return jobId.replace(/:/g, '-');
}

/**
 * Extract BullMQ-compatible connection options from an ioredis instance.
 *
 * Tránh truyền Redis instance trực tiếp vào BullMQ Queue constructor
 * — type mismatch khi project ioredis khác version bullmq bundled ioredis.
 * Extract config: host/port/password/db → BullMQ tự tạo connection nội bộ.
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
 * BullMqWorkflowAdapter — adapter thật cho WorkflowEnginePort (prod).
 *
 * Mỗi QueueName → 1 BullMQ Queue instance (lazy init).
 * Queue dùng connection config extract từ Redis đã wire global.
 *
 * Lifecycle:
 *   - getOrCreateQueue() → new Queue(name, { connection }) — lazy, lần đầu gọi mới tạo
 *   - onModuleDestroy()  → close() tất cả Queue → nhả Redis connection
 *
 * Phase 2 KHÔNG tạo Worker (consumer ở Phase 4+).
 */
@Injectable()
export class BullMqWorkflowAdapter
	implements WorkflowEnginePort, OnModuleDestroy
{
	private readonly logger = new Logger(BullMqWorkflowAdapter.name);
	private readonly queues = new Map<QueueName, Queue>();
	private readonly connectionOpts: ConnectionOptions;

	constructor(@InjectRedis() redis: Redis) {
		this.connectionOpts = extractConnectionOpts(redis);
	}

	async enqueue(
		queue: QueueName,
		payload: JobPayload,
		opts?: EnqueueOptions,
	): Promise<void> {
		const q = this.getOrCreateQueue(queue);
		const sanitizedId = sanitizeJobId(opts?.jobId);

		await q.add(queue, payload, {
			jobId: sanitizedId,
			delay: opts?.delayMs,
			attempts: opts?.attempts ?? 1,
			backoff: { type: 'exponential', delay: 1_000 },
			removeOnComplete: true,
			removeOnFail: 1_000,
		});
	}

	async schedule(
		queue: QueueName,
		payload: JobPayload,
		at: Date,
		opts?: Omit<EnqueueOptions, 'delayMs'>,
	): Promise<void> {
		const delayMs = Math.max(0, at.getTime() - Date.now());
		await this.enqueue(queue, payload, { ...opts, delayMs });
	}

	async onModuleDestroy(): Promise<void> {
		const names = [...this.queues.keys()];
		await Promise.all([...this.queues.values()].map((q) => q.close()));
		this.queues.clear();
		if (names.length > 0) {
			this.logger.log(
				`Closed ${names.length} BullMQ queues: ${names.join(', ')}`,
			);
		}
	}

	// ─────────────────────────────────────────────────────────────────

	private getOrCreateQueue(name: QueueName): Queue {
		let q = this.queues.get(name);
		if (!q) {
			q = new Queue(name, { connection: this.connectionOpts });
			this.queues.set(name, q);
		}
		return q;
	}
}
