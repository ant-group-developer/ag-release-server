import { QueueName } from './workflow-engine.port';

/**
 * OutboxEntry — 1 "ý định enqueue" ghi vào bảng outbox_event trong CÙNG transaction
 * với state + events. Relay poll bảng này rồi mới gọi WorkflowEnginePort.enqueue thật.
 *
 * Xem trace bước 4 PERSIST + bước 5 RELAY.
 */
export interface OutboxEntry {
	readonly queue: QueueName;
	readonly payload: Record<string, unknown>;
	/** Idempotency key = BullMQ jobId. UNIQUE constraint chặn insert trùng ngay tầng DB. */
	readonly jobId: string;
	/** Delay tương đối (ms) — null với schedule tuyệt đối. */
	readonly delayMs?: number;
	/** Mốc tuyệt đối — null với enqueue thường. */
	readonly runAt?: Date;
}
