import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';

import {
	EnqueueOptions,
	QueueName,
	WORKFLOW_ENGINE,
	WorkflowEnginePort,
} from '../../application/ports/workflow-engine.port';

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

	constructor(
		@InjectDataSource() private readonly dataSource: DataSource,
		@Inject(WORKFLOW_ENGINE)
		private readonly engine: WorkflowEnginePort,
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
