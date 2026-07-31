import { Inject, Injectable } from '@nestjs/common';

import { ChannelInputType } from '../../domain/channel-delivery/channel-interpreter.types';
import { PackageUploader } from '../../domain/ports/package-uploader.port';
import { TicketService } from '../../domain/ports/ticket-service.port';
import { DspCode } from '../../domain/value-objects/dsp-code.vo';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';
import { PackagePath } from '../../domain/value-objects/package-path.vo';
import { TicketReason } from '../../domain/value-objects/ticket-ref.vo';
import { TICKET_SERVICE } from '../../infrastructure/adapters/postgres-ticket.adapter';
import {
	ApplyChannelInputCommand,
	ResetForRetryCommand,
} from '../commands/distribution.command';
import { AggregateNotFoundError } from '../errors/aggregate-not-found.error';
import {
	DISTRIBUTION_REPOSITORY,
	DistributionRepository,
} from '../ports/distribution-repository.port';
import { UNIT_OF_WORK, UnitOfWork } from '../ports/unit-of-work.port';
import { groupKeyOf } from './group-channels-by-route';
import { ChannelJobPayload } from './runner-payload';
import { ticketIdempotencyKey } from './ticket-idempotency-key';

/**
 * SftpUploadRunner — consumer của `dist.sftp-upload`.
 *
 * 1. Load Distribution → tìm channel theo channelId → dspCode + package của nhóm (dspRoute)
 * 2. Gọi PackageUploader.upload() — idempotent theo (path, dspCode)
 * 3a. ok → APPLY_CHANNEL_INPUT {STEP_DONE} (interpreter chuyển stage kế)
 * 3b. fail CHƯA cạn retry → APPLY_CHANNEL_INPUT {ACTION_FAIL} KHÔNG ticket
 *           (interpreter đếm retry, drive lại stage — mở ticket ở đây sẽ orphan)
 * 3c. fail CẠN retry (willExhaustOnNextActionFail) → open ticket UPLOAD_FAIL →
 *           APPLY_CHANNEL_INPUT {ACTION_FAIL} + ticketRef → interpreter vào ISSUES
 *
 * VIA_AGGREGATOR: sau upload cũng markBatchDone() để CI nhận batch = imported.
 *
 * Khối C: phân biệt lỗi tạm thời (uploader throw → BullMQ retry) vs lỗi nghiệp vụ (result.ok=false).
 * Trong nhánh nghiệp vụ, còn tách retry-in-place vs exhausted-to-ISSUES để ticket ↔ ISSUES là 1:1.
 */
export const PACKAGE_UPLOADER = Symbol('PackageUploader');

@Injectable()
export class SftpUploadRunner {
	constructor(
		@Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
		@Inject(DISTRIBUTION_REPOSITORY)
		private readonly repo: DistributionRepository,
		@Inject(PACKAGE_UPLOADER) private readonly uploader: PackageUploader,
		@Inject(TICKET_SERVICE) private readonly ticketService: TicketService,
	) {}

	async run(
		payload: ChannelJobPayload,
	): Promise<ApplyChannelInputCommand | ResetForRetryCommand> {
		const dist = await this.uow.run((ctx) =>
			this.repo.load(ctx, payload.distributionId),
		);
		if (!dist) throw new AggregateNotFoundError(payload.distributionId);
		const channel = dist.channels.find(
			(c) => c.channelId === payload.channelId,
		);
		if (!channel) {
			throw new Error(
				`SftpUploadRunner: channel ${payload.channelId} not found`,
			);
		}
		// Channel upload package của NHÓM mình (dspRoute), không phải 1 package chung.
		// groupKey = dspRoute của processCode channel (đã fill khi spawn vào DELIVERING).
		const groupKey = groupKeyOf(channel.spec.processCode);
		const packageUri = dist.packageUriFor(groupKey);
		if (!packageUri) {
			throw new Error(
				`SftpUploadRunner: distribution ${dist.id} missing package for group ${groupKey}`,
			);
		}

		const [bucket, ...keyParts] = packageUri.split('/');
		const path = PackagePath.create(bucket, keyParts.join('/'));
		const key = IdempotencyKey.create(payload.key);
		const dspCode = DspCode.create(channel.spec.dspCode);
		// Cluster CI: upload 1 lần cả cụm → resolve SFTP theo aggregator (dspCode là aggregator
		// code, resolve theo dsp.code sẽ NOT_FOUND). Direct/legacy per-DSP: resolve theo dspCode.
		const aggregatorCode = channel.isCluster
			? channel.spec.aggregatorCode
			: undefined;

		const result = await this.uploader.upload({
			path,
			dspCode,
			key,
			aggregatorCode,
		});

		if (!result.ok) {
			// Khối C: ACTION fail. The interpreter (INV-C2) decides retry-in-place vs ISSUES by
			// counting retryCount against the RetryPolicy — so we open a ticket + attach ticketRef
			// ONLY when this fail EXHAUSTS the budget (→ ISSUES). On a non-exhausting fail we send
			// ACTION_FAIL with NO ticket: the interpreter re-drives the stage and would DROP any
			// ticketRef we passed → an orphan ticket. Gating here keeps ticket ↔ ISSUES 1:1.
			const willExhaust = channel.willExhaustOnNextActionFail;
			let ticketRef: string | undefined;

			if (willExhaust) {
				const ref = await this.ticketService.open({
					distributionId: dist.id,
					channelId: channel.channelId,
					reason: TicketReason.UPLOAD_FAIL,
					detail: `SFTP upload failed for DSP ${channel.spec.dspCode}`,
					// Stable key: one ticket per (channel, reason, retry generation) — NOT payload.key
					// (which drifts every turn). Survives job re-runs; a fresh admin RETRY (bumps
					// dist.retryCount) opens a new ticket.
					key: ticketIdempotencyKey(
						channel.channelId,
						TicketReason.UPLOAD_FAIL,
						dist.retryCount,
					),
				});
				ticketRef = ref.value;
			}

			return {
				type: 'APPLY_CHANNEL_INPUT',
				distributionId: dist.id,
				key: `${payload.key}:fail`,
				channelId: channel.channelId,
				input: {
					type: ChannelInputType.ACTION_FAIL,
					...(ticketRef ? { ticketRef } : {}),
				},
			};
		}

		// VIA_AGGREGATOR: đánh dấu .done để CI nhận batch = imported
		if (channel.spec.aggregatorCode) {
			await this.uploader.markBatchDone({
				path,
				dspCode,
				key,
				aggregatorCode,
			});
		}

		return {
			type: 'APPLY_CHANNEL_INPUT',
			distributionId: dist.id,
			key: `${payload.key}:done`,
			channelId: channel.channelId,
			input: { type: ChannelInputType.STEP_DONE },
		};
	}
}
