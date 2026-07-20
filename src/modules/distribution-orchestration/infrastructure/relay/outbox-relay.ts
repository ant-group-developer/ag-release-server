import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';

import { DISTRIBUTION_EVENT_SAVED } from '../../application/events/distribution-sse-event-names';
import {
	EnqueueOptions,
	QueueName,
	WORKFLOW_ENGINE,
	WorkflowEnginePort,
} from '../../application/ports/workflow-engine.port';
import { DistributionEventSavedPayload } from '../sse/distribution-sse.service';

/**
 * Outbox row shape — chỉ fetch cột relay cần, không import ORM entity
 * (relay dùng raw SQL, không qua repository pattern).
 */
interface OutboxRow {
	readonly id: string;
	readonly queue: string;
	readonly payload: Record<string, unknown>;
	readonly jobId: string;
	readonly delayMs: number;
	readonly runAt: Date | null;
	readonly attempts: number;
}

interface DistributionEventRow {
	readonly id: string;
	readonly distribution_id: string;
	readonly channel_id: string | null;
	readonly type: string;
	readonly level: string;
	readonly payload: Record<string, unknown>;
	readonly occurred_at: string;
}

/** Max dispatch attempts trước khi coi entry là soft-DLQ. */
const MAX_ATTEMPTS = 10;

/** Số entry tối đa mỗi lần poll. */
const DEFAULT_BATCH_SIZE = 50;

/**
 * OutboxRelay — polling worker đọc `outbox_event` chưa dispatch → enqueue BullMQ.
 *
 * Flow mỗi tick (5s):
 *   1. BEGIN tx (QueryRunner — tách khỏi UoW vì relay KHÔNG dùng UoW)
 *   2. SELECT FOR UPDATE SKIP LOCKED — lấy batch pending entries
 *   3. Từng entry: enqueue/schedule → mark dispatched / ghi error
 *   4. COMMIT
 *   5. After commit: query distribution_event WHERE id > lastEmittedEventId → emit EventEmitter2
 *      (SSE bridge — in-process, zero infra, single instance)
 *
 * At-least-once guarantee:
 *   - Entry chỉ được mark `dispatched_at` SAU khi WorkflowEnginePort.enqueue() resolve.
 *   - Crash giữa enqueue + mark → entry vẫn pending → poll kế pick lại.
 *   - BullMQ dedupe qua jobId → enqueue trùng là no-op.
 *
 * Soft DLQ:
 *   - Entry quá MAX_ATTEMPTS bị WHERE clause loại khỏi poll.
 *   - Log warn — Phase 3 dashboard surface entries kẹt.
 */
@Injectable()
export class OutboxRelay {
	private readonly logger = new Logger(OutboxRelay.name);
	private _polling = false;
	/** Tracks highest distribution_event.id emitted to SSE bridge — reset on restart (fine for in-process). */
	private _lastEmittedEventId = '0';

	constructor(
		@InjectDataSource() private readonly dataSource: DataSource,
		@Inject(WORKFLOW_ENGINE)
		private readonly engine: WorkflowEnginePort,
		private readonly eventEmitter: EventEmitter2,
	) {}

	@Cron('*/5 * * * * *')
	async tick(): Promise<void> {
		if (this._polling) return;
		try {
			this._polling = true;
			await this.pollAndDispatch();
		} finally {
			this._polling = false;
		}
	}

	/**
	 * Poll + dispatch pending outbox entries.
	 * Exposed for integration test — tick() wraps với concurrency guard.
	 */
	async pollAndDispatch(batchSize = DEFAULT_BATCH_SIZE): Promise<number> {
		const qr = this.dataSource.createQueryRunner();
		await qr.connect();
		await qr.startTransaction();

		try {
			const rows = await this.fetchPending(qr, batchSize);
			if (rows.length === 0) {
				await qr.commitTransaction();
				return 0;
			}

			let dispatched = 0;
			for (const row of rows) {
				try {
					await this.dispatchEntry(row);
					await this.markDispatched(qr, row.id);
					dispatched++;
				} catch (err) {
					await this.recordFailure(qr, row, err);
				}
			}

			await qr.commitTransaction();

			if (dispatched > 0) {
				this.logger.log(
					`Dispatched ${dispatched}/${rows.length} outbox entries`,
				);
			}

			// After commit: emit new distribution_event rows to SSE bridge
			await this.emitNewDistributionEvents();

			return dispatched;
		} catch (err) {
			if (qr.isTransactionActive) {
				await qr.rollbackTransaction();
			}
			this.logger.error('Outbox relay poll failed', (err as Error).stack);
			return 0;
		} finally {
			await qr.release();
		}
	}

	// ─────────────────────────────────────────────────────────────────

	/**
	 * Query distribution_event rows added since last emit → emit EventEmitter2.
	 * Called after outbox tx commit — read outside that tx, no lock needed.
	 * _lastEmittedEventId resets to '0' on restart → SSE clients reconnect via Last-Event-ID fallback.
	 */
	private async emitNewDistributionEvents(): Promise<void> {
		try {
			const rows: DistributionEventRow[] = await this.dataSource.query(
				`SELECT id, distribution_id, channel_id, type, level, payload, occurred_at
				 FROM   distribution_event
				 WHERE  id > $1
				 ORDER  BY id ASC
				 LIMIT  200`,
				[this._lastEmittedEventId],
			);

			for (const row of rows) {
				const payload: DistributionEventSavedPayload = {
					distributionId: row.distribution_id,
					event: {
						id: String(row.id),
						type: row.type,
						channelId: row.channel_id ?? null,
						level: row.level as 'milestone' | 'progress',
						payload:
							typeof row.payload === 'string'
								? JSON.parse(row.payload)
								: row.payload,
						occurredAt: new Date(row.occurred_at),
					},
				};
				this.eventEmitter.emit(DISTRIBUTION_EVENT_SAVED, payload);
				this._lastEmittedEventId = String(row.id);
			}
		} catch (err) {
			// Non-fatal — SSE just won't get this batch; relay still dispatched outbox
			this.logger.error('SSE bridge emit failed', (err as Error).stack);
		}
	}

	private async fetchPending(
		qr: QueryRunner,
		batchSize: number,
	): Promise<OutboxRow[]> {
		const rows: Array<Record<string, unknown>> = await qr.query(
			`SELECT "id", "queue", "payload", "job_id", "delay_ms", "run_at", "attempts"
			 FROM "outbox_event"
			 WHERE "dispatched_at" IS NULL
			   AND "attempts" < $1
			 ORDER BY "created_at" ASC
			 LIMIT $2
			 FOR UPDATE SKIP LOCKED`,
			[MAX_ATTEMPTS, batchSize],
		);

		return rows.map((r) => ({
			id: String(r.id),
			queue: r.queue as string,
			payload:
				typeof r.payload === 'string'
					? JSON.parse(r.payload)
					: (r.payload as Record<string, unknown>),
			jobId: r.job_id as string,
			delayMs: Number(r.delay_ms),
			runAt: r.run_at ? new Date(r.run_at as string) : null,
			attempts: Number(r.attempts),
		}));
	}

	private async dispatchEntry(row: OutboxRow): Promise<void> {
		const opts: EnqueueOptions = {
			jobId: row.jobId,
			...(row.delayMs > 0 ? { delayMs: row.delayMs } : {}),
		};

		if (row.runAt) {
			await this.engine.schedule(
				row.queue as QueueName,
				row.payload as any,
				row.runAt,
				opts,
			);
		} else {
			await this.engine.enqueue(
				row.queue as QueueName,
				row.payload as any,
				opts,
			);
		}
	}

	private async markDispatched(qr: QueryRunner, id: string): Promise<void> {
		await qr.query(
			`UPDATE "outbox_event" SET "dispatched_at" = now() WHERE "id" = $1`,
			[id],
		);
	}

	private async recordFailure(
		qr: QueryRunner,
		row: OutboxRow,
		err: unknown,
	): Promise<void> {
		const message = err instanceof Error ? err.message : String(err);
		const newAttempts = row.attempts + 1;

		await qr.query(
			`UPDATE "outbox_event"
			 SET "attempts" = $1, "last_error" = $2, "last_attempted_at" = now()
			 WHERE "id" = $3`,
			[newAttempts, message, row.id],
		);

		if (newAttempts >= MAX_ATTEMPTS) {
			this.logger.warn(
				`Outbox entry ${row.id} (jobId=${row.jobId}) reached max attempts (${MAX_ATTEMPTS}). Soft-DLQ — manual investigation needed.`,
			);
		}
	}
}
