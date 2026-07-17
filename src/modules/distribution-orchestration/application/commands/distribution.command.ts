import { CreateDistributionProps } from '../../domain/distribution/distribution.types';

/**
 * DistributionCommand — discriminated union các command gửi vào orchestrate handler.
 *
 * Nguyên tắc:
 *   · Handler nhận đúng 1 command / 1 vòng orchestrate → dispatch theo `type`.
 *   · `key` = idempotencyKey xuyên suốt (log + BullMQ jobId + outbox jobId).
 *   · SUBMIT là command DUY NHẤT có `create` — tạo aggregate mới trong RAM
 *     (repo.load trả null nếu chưa từng persist).
 *   · Các command khác require aggregate đã tồn tại — load null → AggregateNotFoundError.
 *
 * Step 4 chỉ implement 2 command (submit + markValidated) chạy được end-to-end
 * in-memory. Step 5+ mở rộng: markIdsProvisioned, markPackageBuilt, applyChannelInput,
 * flagValidationErrors, approveReview, rejectReview, resubmit, resetForRetry, markTakenDown.
 */

export type DistributionCommand = SubmitCommand | MarkValidatedCommand;

/** DRAFT → VALIDATING. Tạo aggregate mới nếu load() null. */
export interface SubmitCommand {
	readonly type: 'SUBMIT';
	readonly distributionId: string;
	readonly key: string;
	/**
	 * Props để `Distribution.create()` khi aggregate chưa tồn tại.
	 * Handler check load() null → create + submit; load() có → submit (idempotent guard trong aggregate).
	 */
	readonly create: CreateDistributionProps;
}

/** VALIDATING → IN_REVIEW | PROVISIONING_IDS | DELIVERING. */
export interface MarkValidatedCommand {
	readonly type: 'MARK_VALIDATED';
	readonly distributionId: string;
	readonly key: string;
	readonly requiresReview: boolean;
}
