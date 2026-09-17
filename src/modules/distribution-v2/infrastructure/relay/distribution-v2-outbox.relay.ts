import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DistributionV2ConfigService } from '../../config/distribution-v2.config.service';
import {
	DistributionV2QueueName,
	DistributionV2QueueService,
} from '../queue/distribution-v2.queue.service';

/**
 * V2-only outbox relay.  It is intentionally a separate process/provider from
 * the legacy relay and only reads distribution_v2.outbox_events.
 */
@Injectable()
export class DistributionV2OutboxRelay
	implements OnModuleInit, OnModuleDestroy
{
	private readonly logger = new Logger(DistributionV2OutboxRelay.name);
	private timer: ReturnType<typeof setInterval> | null = null;
	private running = false;

	constructor(
		@InjectDataSource() private readonly dataSource: DataSource,
		private readonly queue: DistributionV2QueueService,
		private readonly config: DistributionV2ConfigService,
	) {}

	onModuleInit(): void {
		if (!this.config.isEnabled()) return;
		this.timer = setInterval(() => {
			void this.pollAndDispatch().catch((error: unknown) => {
				this.logger.error(
					`V2 outbox poll failed: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			});
		}, this.config.getOutboxPollIntervalMs());
		this.timer.unref?.();
		void this.pollAndDispatch().catch((error: unknown) => {
			this.logger.error(
				`V2 outbox poll failed: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		});
	}

	async pollAndDispatch(batchSize = 50): Promise<number> {
		if (this.running) return 0;
		this.running = true;
		try {
			return await this.dataSource.transaction(async (manager) => {
				const rows: Array<{
					id: string;
					queue_name: DistributionV2QueueName;
					payload: Record<string, unknown>;
					job_id: string;
				}> = await manager.query(
					`SELECT "id", "queue_name", "payload", "job_id",
						"available_at", "attempts"
					 FROM "distribution_v2"."outbox_events"
					 WHERE "dispatched_at" IS NULL
					   AND "available_at" <= now()
					   AND ("lease_until" IS NULL OR "lease_until" < now())
					   AND "attempts" < 10
					 ORDER BY "created_at" ASC
					 LIMIT $1
					 FOR UPDATE SKIP LOCKED`,
					[batchSize],
				);
				let dispatched = 0;

				for (const row of rows) {
					try {
						await this.queue.add(
							row.queue_name,
							parsePayload(row.payload),
							{
								jobId: row.job_id,
								attempts: 3,
								removeOnComplete: 1000,
								removeOnFail: false,
							},
						);
						await manager.query(
							`UPDATE "distribution_v2"."outbox_events"
							 SET "dispatched_at" = now(), "lease_until" = NULL
							 WHERE "id" = $1`,
							[row.id],
						);
						dispatched++;
					} catch (error) {
						const message =
							error instanceof Error
								? error.message
								: String(error);
						await manager.query(
							`UPDATE "distribution_v2"."outbox_events"
							 SET "attempts" = "attempts" + 1,
							     "last_error" = $2,
							     "last_attempted_at" = now(),
							     "lease_until" = NULL
							 WHERE "id" = $1`,
							[row.id, message],
						);
						this.logger.error(
							`Could not dispatch v2 outbox ${row.id}: ${message}`,
						);
					}
				}
				return dispatched;
			});
		} finally {
			this.running = false;
		}
	}

	onModuleDestroy(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}
}

function parsePayload(
	payload: Record<string, unknown> | string,
): Record<string, unknown> {
	if (typeof payload === 'string')
		return JSON.parse(payload) as Record<string, unknown>;
	return payload;
}
