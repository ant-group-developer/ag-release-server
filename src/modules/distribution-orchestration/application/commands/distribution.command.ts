import { ChannelInput } from '../../domain/channel-delivery/channel-interpreter.types';
import {
	CreateDistributionProps,
	RetryScope,
} from '../../domain/distribution/distribution.types';

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
 * 10 command khớp aggregate transitions (Step 5 mở rộng từ 2 → 10):
 *   · SUBMIT                     DRAFT → VALIDATING
 *   · MARK_VALIDATED             VALIDATING → IN_REVIEW | PROVISIONING_IDS | DELIVERING
 *   · FLAG_VALIDATION_ERRORS     VALIDATING → ACTION_REQUIRED
 *   · APPROVE_REVIEW             IN_REVIEW → PROVISIONING_IDS | DELIVERING
 *   · REJECT_REVIEW              IN_REVIEW → ACTION_REQUIRED
 *   · RESUBMIT                   ACTION_REQUIRED → VALIDATING
 *   · MARK_IDS_PROVISIONED       PROVISIONING_IDS → BUILDING_PACKAGE
 *   · MARK_PACKAGE_BUILT         BUILDING_PACKAGE → DELIVERING
 *   · APPLY_CHANNEL_INPUT        (DELIVERING) — channel interpreter tick
 *   · RESET_FOR_RETRY            PARTIALLY_DISTRIBUTED | FAILED → DELIVERING
 *   · MARK_TAKEN_DOWN            DISTRIBUTED | PARTIALLY_DISTRIBUTED → TAKEN_DOWN
 */
export type DistributionCommand =
	| SubmitCommand
	| MarkValidatedCommand
	| FlagValidationErrorsCommand
	| ApproveReviewCommand
	| RejectReviewCommand
	| ResubmitCommand
	| MarkIdsProvisionedCommand
	| MarkPackageBuiltCommand
	| ApplyChannelInputCommand
	| ResetForRetryCommand
	| MarkTakenDownCommand;

interface CommandBase {
	readonly distributionId: string;
	readonly key: string;
}

/** DRAFT → VALIDATING. Tạo aggregate mới nếu load() null. */
export interface SubmitCommand extends CommandBase {
	readonly type: 'SUBMIT';
	readonly create: CreateDistributionProps;
}

/** VALIDATING → IN_REVIEW | PROVISIONING_IDS | DELIVERING. */
export interface MarkValidatedCommand extends CommandBase {
	readonly type: 'MARK_VALIDATED';
	readonly requiresReview: boolean;
}

/** VALIDATING → ACTION_REQUIRED (validator external phát hiện lỗi). */
export interface FlagValidationErrorsCommand extends CommandBase {
	readonly type: 'FLAG_VALIDATION_ERRORS';
	readonly ticketRef: string;
	readonly errors: string[];
}

/** IN_REVIEW → PROVISIONING_IDS | DELIVERING (reviewer đồng ý). */
export interface ApproveReviewCommand extends CommandBase {
	readonly type: 'APPROVE_REVIEW';
	readonly reviewerId: string;
}

/** IN_REVIEW → ACTION_REQUIRED (reviewer từ chối). */
export interface RejectReviewCommand extends CommandBase {
	readonly type: 'REJECT_REVIEW';
	readonly reviewerId: string;
	readonly ticketRef: string;
	readonly note: string;
}

/** ACTION_REQUIRED → VALIDATING (user/reviewer đã fix). */
export interface ResubmitCommand extends CommandBase {
	readonly type: 'RESUBMIT';
}

/** PROVISIONING_IDS → BUILDING_PACKAGE. `upc?` — UPDATE không cấp mới. */
export interface MarkIdsProvisionedCommand extends CommandBase {
	readonly type: 'MARK_IDS_PROVISIONED';
	readonly upc?: string;
}

/**
 * BUILDING_PACKAGE → DELIVERING.
 * `packageUris` map groupKey (dspRoute) → package path vừa build. 1 package/nhóm phân phối
 * (Spotify direct + CI aggregator = 2 nhóm khác ernVersion/sender/SFTP). Mỗi channel upload
 * đọc package của nhóm mình (xem SftpUploadRunner + groupChannelsByRoute).
 */
export interface MarkPackageBuiltCommand extends CommandBase {
	readonly type: 'MARK_PACKAGE_BUILT';
	readonly packageUris: Record<string, string>;
}

/**
 * Channel-level input (DELIVERING). Handler forward vào aggregate.applyChannelInput()
 * → chạy interpreter → aggregate.syncChannelOutcome (auto bubble-up nếu terminal).
 */
export interface ApplyChannelInputCommand extends CommandBase {
	readonly type: 'APPLY_CHANNEL_INPUT';
	readonly channelId: string;
	readonly input: ChannelInput;
}

/** PARTIALLY_DISTRIBUTED | FAILED → DELIVERING (chỉ khi policy.canRetry()). */
export interface ResetForRetryCommand extends CommandBase {
	readonly type: 'RESET_FOR_RETRY';
	readonly scope: RetryScope;
}

/** DISTRIBUTED | PARTIALLY_DISTRIBUTED → TAKEN_DOWN (TAKEDOWN policy). */
export interface MarkTakenDownCommand extends CommandBase {
	readonly type: 'MARK_TAKEN_DOWN';
}
