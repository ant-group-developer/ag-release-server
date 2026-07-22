import {
	QUEUES,
	QueueName,
} from '../../application/ports/workflow-engine.port';

/**
 * Cấu hình resilience TĨNH per-queue (Phase 5 Khối D — hardcode, đọc-theo-DSP là YAGNI).
 *
 * Hai nhóm cấu hình:
 *   1. Worker-side  — concurrency (bulkhead) + limiter (rate-limit per host).
 *   2. Enqueue-side — attempts + backoff (retry lỗi transient tầng job).
 */

/** Rate-limit BullMQ Worker (max job / duration ms). */
export interface QueueLimiter {
	readonly max: number;
	readonly duration: number;
}

export interface QueueConcurrency {
	readonly concurrency: number;
	readonly limiter?: QueueLimiter;
}

/**
 * Bulkhead + rate-limit per queue.
 *   · SFTP upload concurrency THẤP (2) + limiter → 1 host SFTP nghẽn không kéo sập queue khác.
 *   · CI poll (import/qa/status) concurrency vừa phải.
 *   · orchestrate/provision/build/validate: default.
 * Queue không có trong map → DEFAULT_CONCURRENCY (1, tuần tự an toàn).
 */
const DEFAULT_CONCURRENCY = 1;

const CONCURRENCY_BY_QUEUE: Partial<Record<QueueName, QueueConcurrency>> = {
	// Bulkhead: SFTP nghẽn cô lập; limiter per host tĩnh (5 job / 1s).
	[QUEUES.SFTP_UPLOAD]: { concurrency: 2, limiter: { max: 5, duration: 1000 } },
	[QUEUES.CI_IMPORT_CHECK]: { concurrency: 4 },
	[QUEUES.CI_QA_CHECK]: { concurrency: 4 },
	[QUEUES.STATUS_SYNC]: { concurrency: 4 },
	[QUEUES.ORCHESTRATE]: { concurrency: 8 }, // turn engine — nhẹ, thông lượng cao
};

export function queueConcurrency(queue: QueueName): QueueConcurrency {
	return (
		CONCURRENCY_BY_QUEUE[queue] ?? { concurrency: DEFAULT_CONCURRENCY }
	);
}

/** attempts + backoff (ms base, exponential) khi worker THROW lỗi transient. */
export interface QueueRetry {
	readonly attempts: number;
	readonly backoffMs: number;
}

/**
 * Retry-backoff per queue (map RetryPolicy VO domain → BullMQ EnqueueOptions).
 *   · SFTP upload: 3 lần, exp từ 30s (khớp RetryPolicy.sftpDefault()).
 *   · CI poll:     3 lần, exp từ 10s.
 *   · orchestrate: 3 lần, exp từ 1s (optimistic-lock/transient DB).
 * Queue không có trong map → DEFAULT_RETRY (1 lần, không backoff — SUBMIT idempotent).
 */
const DEFAULT_RETRY: QueueRetry = { attempts: 1, backoffMs: 1000 };

const RETRY_BY_QUEUE: Partial<Record<QueueName, QueueRetry>> = {
	[QUEUES.SFTP_UPLOAD]: { attempts: 3, backoffMs: 30_000 },
	[QUEUES.CI_IMPORT_CHECK]: { attempts: 3, backoffMs: 10_000 },
	[QUEUES.CI_QA_CHECK]: { attempts: 3, backoffMs: 10_000 },
	[QUEUES.STATUS_SYNC]: { attempts: 3, backoffMs: 10_000 },
	[QUEUES.ORCHESTRATE]: { attempts: 3, backoffMs: 1_000 },
	[QUEUES.PROVISION_ID]: { attempts: 3, backoffMs: 5_000 },
	[QUEUES.BUILD_PACKAGE]: { attempts: 3, backoffMs: 5_000 },
};

export function queueRetry(queue: QueueName): QueueRetry {
	return RETRY_BY_QUEUE[queue] ?? DEFAULT_RETRY;
}
