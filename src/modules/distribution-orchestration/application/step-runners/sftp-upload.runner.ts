import { Inject, Injectable } from '@nestjs/common';

import { ChannelInputType } from '../../domain/channel-delivery/channel-interpreter.types';
import { PackageUploader } from '../../domain/ports/package-uploader.port';
import { DspCode } from '../../domain/value-objects/dsp-code.vo';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';
import { PackagePath } from '../../domain/value-objects/package-path.vo';
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
import { ChannelJobPayload } from './runner-payload';

/**
 * SftpUploadRunner — consumer của `dist.sftp-upload`.
 *
 * 1. Load Distribution → tìm channel theo channelId → dspCode + packageUri
 * 2. Gọi PackageUploader.upload() — idempotent theo (path, dspCode)
 * 3a. ok → APPLY_CHANNEL_INPUT {STEP_DONE} (interpreter chuyển stage kế)
 * 3b. fail → APPLY_CHANNEL_INPUT {ACTION_FAIL} (interpreter tự count retry; hết
 *          → cần ticketRef → runner mở ticket qua TicketService (Step 6 wire) và
 *          gửi kèm ticketRef; hiện Step 5b: throw để BullMQ retry job)
 *
 * VIA_AGGREGATOR: sau upload cũng markBatchDone() để CI nhận batch = imported.
 */
export const PACKAGE_UPLOADER = Symbol('PackageUploader');

@Injectable()
export class SftpUploadRunner {
	constructor(
		@Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
		@Inject(DISTRIBUTION_REPOSITORY)
		private readonly repo: DistributionRepository,
		@Inject(PACKAGE_UPLOADER) private readonly uploader: PackageUploader,
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
		if (!dist.packageUri) {
			throw new Error(
				`SftpUploadRunner: distribution ${dist.id} missing packageUri`,
			);
		}

		const [bucket, ...keyParts] = dist.packageUri.split('/');
		const path = PackagePath.create(bucket, keyParts.join('/'));
		const key = IdempotencyKey.create(payload.key);
		const dspCode = DspCode.create(channel.spec.dspCode);

		const result = await this.uploader.upload({ path, dspCode, key });

		if (!result.ok) {
			// Fail path: BullMQ retry job — throw để trigger BullMQ backoff. Sau
			// hết attempts, DLQ + runner phát ACTION_FAIL với ticketRef ở Step 6.
			throw new Error(
				`SftpUploadRunner: upload failed for ${channel.channelId}`,
			);
		}

		// VIA_AGGREGATOR: đánh dấu .done để CI nhận batch = imported
		if (channel.spec.aggregatorCode) {
			await this.uploader.markBatchDone({ path, key });
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
