import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

interface DistributionEventRow {
	readonly id: string;
	readonly distribution_id: string;
	readonly channel_id: string | null;
	readonly type: string;
	readonly payload: Record<string, unknown>;
	readonly occurred_at: string;
	readonly release_id: string;
	readonly dsp_code: string | null;
	/** CI cluster channel: shared-stage event áp cho MỌI member DSP (không phải 1 dsp_code). */
	readonly is_cluster: boolean | null;
	readonly member_dsp_codes: Array<{ dspCode: string }> | null;
}

interface ProjectionUpdate {
	status?: string;
	hasLiveVersion?: boolean;
	setEnqueuedAt?: boolean;
	setDeliveredAt?: boolean;
}

const DEFAULT_BATCH_SIZE = 200;

/**
 * Maps domain event type → projection update.
 * Only events that affect release_dsp_delivery are listed.
 * channel_id NULL events update ALL rows for the release.
 */
const EVENT_TO_STATUS_MAP: Record<
	string,
	(ev: DistributionEventRow) => ProjectionUpdate
> = {
	DistributionSubmitted: () => ({
		status: 'processing',
		setEnqueuedAt: true,
	}),
	ChannelLive: () => ({
		status: 'distributed',
		hasLiveVersion: true,
		setDeliveredAt: true,
	}),
	ChannelIssues: () => ({ status: 'issues' }),
	ChannelReset: () => ({ status: 'processing', setEnqueuedAt: true }),
	ChannelTakenDown: () => ({ status: 'taken_down', hasLiveVersion: false }),
	Distributed: () => ({
		status: 'distributed',
		hasLiveVersion: true,
		setDeliveredAt: true,
	}),
	PartiallyDistributed: () => ({ status: 'processing' }),
	DistributionFailed: () => ({ status: 'issues' }),
};

/**
 * ReleaseDspDeliveryProjection — reads distribution_event rows since last checkpoint
 * and upserts release_dsp_delivery read model.
 *
 * Runs every 10s (piggybacks on distribution activity cadence).
 * Checkpoint advances per-event so partial batches survive crash without double-projection.
 * UPSERT uses IS DISTINCT FROM guard → replay = no-op, no spurious updated_at writes.
 */
@Injectable()
export class ReleaseDspDeliveryProjection {
	private readonly logger = new Logger(ReleaseDspDeliveryProjection.name);
	/** In-process lock — same pattern as OutboxRelay. */
	private _projecting = false;

	// ── Metrics (in-process, read via getMetrics()) ──
	private _eventsProcessedTotal = 0;
	private _errorsTotal = 0;
	private _pollsTotal = 0;

	constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

	@Cron('*/10 * * * * *')
	async tick(): Promise<void> {
		if (this._projecting) return;
		try {
			this._projecting = true;
			await this.pollAndProject();
		} finally {
			this._projecting = false;
		}
	}

	/** Exposed for integration tests. */
	async pollAndProject(batchSize = DEFAULT_BATCH_SIZE): Promise<number> {
		this._pollsTotal++;
		const lastEventId = await this.getCheckpoint();

		const events: DistributionEventRow[] = await this.dataSource.query(
			`SELECT de.id,
			        de.distribution_id,
			        de.channel_id,
			        de.type,
			        de.payload,
			        de.occurred_at,
			        d.release_id,
			        cd.dsp_code,
			        cd.is_cluster,
			        cd.member_dsp_codes
			 FROM   distribution_event de
			 JOIN   distribution        d  ON d.id  = de.distribution_id
			 LEFT JOIN channel_delivery cd ON cd.channel_id = de.channel_id
			 WHERE  de.id > $1
			 ORDER  BY de.id ASC
			 LIMIT  $2`,
			[lastEventId, batchSize],
		);

		if (events.length === 0) return 0;

		let projected = 0;
		for (const ev of events) {
			try {
				await this.applyEvent(ev);
				projected++;
				this._eventsProcessedTotal++;
			} catch (err) {
				this.logger.error(
					`Projection failed for event ${ev.id} (${ev.type})`,
					(err as Error).stack,
				);
				this._errorsTotal++;
				await this.writeDeadLetter(ev, err as Error);
			}
			// Advance checkpoint after every event (success or skip) — prevents re-projection on next poll
			await this.advanceCheckpoint(ev.id);
		}

		if (projected > 0) {
			this.logger.log(
				`Projected ${projected}/${events.length} events into release_dsp_delivery`,
			);
		}

		return projected;
	}

	// ─────────────────────────────────────────────────────────────────

	private async applyEvent(ev: DistributionEventRow): Promise<void> {
		const mapper = EVENT_TO_STATUS_MAP[ev.type];
		if (!mapper) return; // event irrelevant to read model

		const update = mapper(ev);

		if (ev.channel_id && ev.is_cluster) {
			// CI cluster shared-stage event (deliver/ingest/qa ISSUES…) → áp cho MỌI member DSP.
			// dsp_code của cluster row là aggregator code, KHÔNG map 1 DSP → expand qua members.
			const members = ev.member_dsp_codes ?? [];
			for (const m of members) {
				const dspId = await this.resolveDspId(m.dspCode);
				if (!dspId) {
					this.logger.warn(
						`No DSP found for cluster member "${m.dspCode}" (event ${ev.id})`,
					);
					continue;
				}
				await this.upsertDelivery(
					ev.release_id,
					dspId,
					update,
					new Date(ev.occurred_at),
				);
			}
		} else if (ev.channel_id && ev.dsp_code) {
			// Channel-level event (direct DSP hoặc go-live watcher) → update 1 dsp row.
			const dspId = await this.resolveDspId(ev.dsp_code);
			if (!dspId) {
				this.logger.warn(
					`No DSP found for code "${ev.dsp_code}" (event ${ev.id})`,
				);
				return;
			}
			await this.upsertDelivery(
				ev.release_id,
				dspId,
				update,
				new Date(ev.occurred_at),
			);
		} else {
			// Distribution-level event (channel_id IS NULL) → update all dsp rows for release
			await this.upsertAllDeliveries(
				ev.release_id,
				update,
				new Date(ev.occurred_at),
			);
		}
	}

	private async upsertDelivery(
		releaseId: string,
		dspId: string,
		update: ProjectionUpdate,
		occurredAt: Date,
	): Promise<void> {
		await this.dataSource.query(
			`INSERT INTO release_dsp_delivery
			   (release_id, dsp_id, status, has_live_version, last_enqueued_at, last_delivered_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6, now())
			 ON CONFLICT (release_id, dsp_id) DO UPDATE
			   SET status            = COALESCE(EXCLUDED.status,            release_dsp_delivery.status),
			       has_live_version  = COALESCE(EXCLUDED.has_live_version,  release_dsp_delivery.has_live_version),
			       last_enqueued_at  = COALESCE(EXCLUDED.last_enqueued_at,  release_dsp_delivery.last_enqueued_at),
			       last_delivered_at = COALESCE(EXCLUDED.last_delivered_at, release_dsp_delivery.last_delivered_at),
			       updated_at        = now()
			   WHERE EXCLUDED.status           IS DISTINCT FROM release_dsp_delivery.status
			      OR EXCLUDED.has_live_version IS DISTINCT FROM release_dsp_delivery.has_live_version`,
			[
				releaseId,
				dspId,
				update.status ?? null,
				update.hasLiveVersion ?? false,
				update.setEnqueuedAt ? occurredAt : null,
				update.setDeliveredAt ? occurredAt : null,
			],
		);
	}

	private async upsertAllDeliveries(
		releaseId: string,
		update: ProjectionUpdate,
		occurredAt: Date,
	): Promise<void> {
		await this.dataSource.query(
			`UPDATE release_dsp_delivery
			 SET    status           = COALESCE($2, status),
			        has_live_version = COALESCE($3, has_live_version),
			        last_enqueued_at = CASE WHEN $4 THEN $5 ELSE last_enqueued_at END,
			        updated_at       = now()
			 WHERE  release_id = $1
			   AND  ($2 IS DISTINCT FROM status OR $3 IS DISTINCT FROM has_live_version)`,
			[
				releaseId,
				update.status ?? null,
				update.hasLiveVersion ?? null,
				update.setEnqueuedAt ?? false,
				occurredAt,
			],
		);
	}

	private async resolveDspId(dspCode: string): Promise<string | null> {
		const rows: Array<{ id: string }> = await this.dataSource.query(
			`SELECT id FROM dsps WHERE code = $1 LIMIT 1`,
			[dspCode],
		);
		return rows[0]?.id ?? null;
	}

	private async getCheckpoint(): Promise<string> {
		const rows: Array<{ last_event_id: string }> =
			await this.dataSource.query(
				`SELECT last_event_id FROM projection_checkpoint WHERE name = 'release_dsp_delivery'`,
			);
		return rows[0]?.last_event_id ?? '0';
	}

	private async advanceCheckpoint(eventId: string): Promise<void> {
		await this.dataSource.query(
			`INSERT INTO projection_checkpoint (name, last_event_id, updated_at)
			 VALUES ('release_dsp_delivery', $1, now())
			 ON CONFLICT (name) DO UPDATE
			   SET last_event_id = EXCLUDED.last_event_id,
			       updated_at    = now()
			 WHERE EXCLUDED.last_event_id > projection_checkpoint.last_event_id`,
			[eventId],
		);
	}

	private async writeDeadLetter(
		ev: DistributionEventRow,
		err: Error,
	): Promise<void> {
		try {
			await this.dataSource.query(
				`INSERT INTO projection_dead_letter (checkpoint_name, event_id, event_type, error_message)
				 VALUES ('release_dsp_delivery', $1, $2, $3)`,
				[ev.id, ev.type, err.message],
			);
		} catch (dlqErr) {
			// DLQ write failure is non-fatal — already logged the original error above
			this.logger.warn(
				`Failed to write DLQ entry for event ${ev.id}`,
				(dlqErr as Error).message,
			);
		}
	}

	// ── Admin / Reconciliation API ──────────────────────────────────

	/**
	 * Reset checkpoint to 0 → next tick replays ALL events from scratch.
	 * Use to rebuild read model after schema change or data corruption.
	 */
	async resetCheckpoint(): Promise<void> {
		await this.dataSource.query(
			`UPDATE projection_checkpoint
			 SET last_event_id = 0, updated_at = now()
			 WHERE name = 'release_dsp_delivery'`,
		);
		this.logger.warn(
			'Projection checkpoint reset to 0 — full replay will run on next tick',
		);
	}

	/**
	 * Reset + immediately replay all events in a loop until caught up.
	 * Returns total events projected.
	 */
	async resetAndReplay(batchSize = DEFAULT_BATCH_SIZE): Promise<number> {
		await this.resetCheckpoint();

		let total = 0;
		let batch: number;
		do {
			batch = await this.pollAndProject(batchSize);
			total += batch;
		} while (batch > 0);

		this.logger.log(`Full replay completed: ${total} events projected`);
		return total;
	}

	/**
	 * Projection lag in seconds: now() minus the occurred_at of the checkpoint event.
	 * Returns 0 if fully caught up (checkpoint = max event id), null if no events exist.
	 */
	async getLagSeconds(): Promise<number | null> {
		const rows: Array<{ lag_seconds: number | null }> =
			await this.dataSource.query(
				`SELECT EXTRACT(EPOCH FROM (now() - de.occurred_at))::int AS lag_seconds
				 FROM   projection_checkpoint pc
				 JOIN   distribution_event de ON de.id = pc.last_event_id
				 WHERE  pc.name = 'release_dsp_delivery'`,
			);
		if (rows.length === 0 || rows[0].lag_seconds == null) return null;

		// Check if there are newer events beyond checkpoint
		const pending: Array<{ cnt: string }> = await this.dataSource.query(
			`SELECT count(*)::int AS cnt
			 FROM   distribution_event
			 WHERE  id > (SELECT last_event_id FROM projection_checkpoint WHERE name = 'release_dsp_delivery')`,
		);

		// If no pending events, lag is effectively 0 (fully caught up)
		return Number(pending[0]?.cnt) === 0 ? 0 : Number(rows[0].lag_seconds);
	}

	/**
	 * Detect drift between event log and read model.
	 * Compares the latest status-bearing event per (release_id, dsp_id) with
	 * the current release_dsp_delivery.status. Returns mismatched rows.
	 *
	 * GAP (follow-up): JOIN cd.dsp_code = dsps.code — CI cluster row có dsp_code=aggregator code
	 * (không khớp DSP nào) nên event CHỈ-cluster (QA/ingest ISSUES TRƯỚC fan-out) không xuất hiện
	 * cho member DSP ở đây. Luồng chính (applyEvent) đã expand đúng qua member_dsp_codes; drift chỉ
	 * là công cụ reconciliation admin. Khi cần: expand cluster event qua member_dsp_codes trong CTE.
	 */
	async detectDrift(): Promise<DriftRow[]> {
		return this.dataSource.query(`
			WITH latest_event AS (
				SELECT DISTINCT ON (d.release_id, ds.id)
					d.release_id,
					ds.id AS dsp_id,
					de.type AS event_type,
					de.id AS event_id
				FROM   distribution_event de
				JOIN   distribution d ON d.id = de.distribution_id
				JOIN   channel_delivery cd ON cd.channel_id = de.channel_id
				JOIN   dsps ds ON ds.code = cd.dsp_code
				WHERE  de.type IN ('DistributionSubmitted','ChannelLive','ChannelIssues',
				                   'ChannelReset','ChannelTakenDown','Distributed',
				                   'PartiallyDistributed','DistributionFailed')
				ORDER  BY d.release_id, ds.id, de.id DESC
			)
			SELECT le.release_id,
			       le.dsp_id,
			       le.event_type AS latest_event_type,
			       le.event_id   AS latest_event_id,
			       rdd.status    AS read_model_status,
			       CASE le.event_type
			           WHEN 'DistributionSubmitted'   THEN 'processing'
			           WHEN 'ChannelLive'             THEN 'distributed'
			           WHEN 'ChannelIssues'           THEN 'issues'
			           WHEN 'ChannelReset'            THEN 'processing'
			           WHEN 'ChannelTakenDown'        THEN 'taken_down'
			           WHEN 'Distributed'             THEN 'distributed'
			           WHEN 'PartiallyDistributed'    THEN 'processing'
			           WHEN 'DistributionFailed'      THEN 'issues'
			       END AS expected_status
			FROM   latest_event le
			LEFT JOIN release_dsp_delivery rdd
			  ON rdd.release_id = le.release_id AND rdd.dsp_id = le.dsp_id
			WHERE  rdd.status IS NULL
			   OR  rdd.status != CASE le.event_type
			           WHEN 'DistributionSubmitted'   THEN 'processing'
			           WHEN 'ChannelLive'             THEN 'distributed'
			           WHEN 'ChannelIssues'           THEN 'issues'
			           WHEN 'ChannelReset'            THEN 'processing'
			           WHEN 'ChannelTakenDown'        THEN 'taken_down'
			           WHEN 'Distributed'             THEN 'distributed'
			           WHEN 'PartiallyDistributed'    THEN 'processing'
			           WHEN 'DistributionFailed'      THEN 'issues'
			       END
		`);
	}

	/** Dead letter entries for this projection (newest first, max 100). */
	async getDeadLetters(limit = 100): Promise<DeadLetterRow[]> {
		return this.dataSource.query(
			`SELECT id, event_id, event_type, error_message, created_at
			 FROM   projection_dead_letter
			 WHERE  checkpoint_name = 'release_dsp_delivery'
			 ORDER  BY created_at DESC
			 LIMIT  $1`,
			[limit],
		);
	}

	/** In-process metrics snapshot. */
	getMetrics(): ProjectionMetrics {
		return {
			eventsProcessedTotal: this._eventsProcessedTotal,
			errorsTotal: this._errorsTotal,
			pollsTotal: this._pollsTotal,
		};
	}
}

// ── Types ───────────────────────────────────────────────────────────

export interface DriftRow {
	release_id: string;
	dsp_id: string;
	latest_event_type: string;
	latest_event_id: string;
	read_model_status: string | null;
	expected_status: string;
}

export interface ProjectionMetrics {
	eventsProcessedTotal: number;
	errorsTotal: number;
	pollsTotal: number;
}

export interface DeadLetterRow {
	id: string;
	event_id: string;
	event_type: string;
	error_message: string;
	created_at: Date;
}
