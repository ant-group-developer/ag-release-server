import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * StepErrorRecorder — ghi error event vào `distribution_event` khi runner/step
 * fail sau khi hết retry (final failure).
 *
 * Ghi NGOÀI aggregate (không qua pullDomainEvents) vì:
 *   · Error không trigger state transition (state giữ nguyên)
 *   · Error xảy ra ở tầng infrastructure (BullMQ worker)
 *   · Chỉ cần audit trail + SSE notification
 *
 * Dùng raw SQL + DataSource riêng (tương tự OutboxRelay) — không chia sẻ
 * UoW transaction với aggregate. Best-effort: caller wrap `.catch()`.
 *
 * SSE bridge tự pick up: OutboxRelay query `distribution_event WHERE id > lastEmittedId`
 * → error event sẽ được stream tới client ở lần poll kế (≤5s).
 */
@Injectable()
export class StepErrorRecorder {
	private readonly logger = new Logger(StepErrorRecorder.name);

	constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

	/**
	 * Record a step failure event.
	 *
	 * @param input.distributionId - Distribution aggregate ID
	 * @param input.channelId      - Channel ID (nếu channel-level job, e.g. SFTP upload)
	 * @param input.queue          - BullMQ queue name (e.g. 'dist.validate')
	 * @param input.error          - Error message
	 * @param input.attemptsMade   - Number of attempts BullMQ made before giving up
	 * @param input.jobId          - BullMQ job ID (for debugging)
	 */
	async record(input: {
		distributionId: string;
		channelId?: string;
		queue: string;
		error: string;
		attemptsMade: number;
		jobId?: string;
	}): Promise<void> {
		const { distributionId, channelId, queue, error, attemptsMade, jobId } =
			input;

		await this.dataSource.query(
			`INSERT INTO "distribution_event"
			 ("distribution_id", "channel_id", "type", "level", "payload", "occurred_at")
			 VALUES ($1, $2, 'StepFailed', 'error', $3, NOW())`,
			[
				distributionId,
				channelId ?? null,
				JSON.stringify({ queue, error, attemptsMade, jobId }),
			],
		);

		this.logger.warn(
			`Recorded StepFailed: dist=${distributionId} queue=${queue} attempts=${attemptsMade} error=${error}`,
		);
	}
}
