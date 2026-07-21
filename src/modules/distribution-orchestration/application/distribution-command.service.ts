import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { ExecutionTypeEnum } from '../domain/value-objects/execution-type.enum';
import { SubmitCommand } from './commands/distribution.command';
import {
	RELEASE_SNAPSHOT_WRITER,
	ReleaseSnapshotWriter,
} from './ports/release-snapshot-writer.port';
import {
	EnqueueOptions,
	QUEUES,
	WORKFLOW_ENGINE,
	WorkflowEnginePort,
} from './ports/workflow-engine.port';

/**
 * DistributionCommandService — entry point cho HTTP → queue.
 *
 * Khối A implement `submit`: tạo snapshot bất biến từ release → enqueue SUBMIT.
 * Khối B/E thêm approveReview/rejectReview/retry.
 */
@Injectable()
export class DistributionCommandService {
	constructor(
		@Inject(WORKFLOW_ENGINE)
		private readonly workflowEngine: WorkflowEnginePort,
		@Inject(RELEASE_SNAPSHOT_WRITER)
		private readonly snapshotWriter: ReleaseSnapshotWriter,
	) {}

	/**
	 * Submit distribution — tạo snapshot bất biến + enqueue SUBMIT command.
	 *
	 * @returns distributionId
	 */
	async submit(input: {
		releaseId: string;
		tenantId: string;
		type: ExecutionTypeEnum;
		channelSpecs: unknown[];
		idempotencyKey?: string;
	}): Promise<string> {
		const distributionId = uuidv4();
		const correlationId = uuidv4();

		// Idempotency ổn định: client cấp, hoặc derive từ releaseId+type
		// → double-submit cùng release+type dùng chung key (jobId dedupe chặn trùng).
		const key =
			input.idempotencyKey ?? `submit:${input.releaseId}:${input.type}`;

		// 1. Tạo snapshot bất biến (chụp release tại thời điểm submit)
		const snapshotId = await this.snapshotWriter.createFromRelease(
			input.releaseId,
		);

		// 2. Enqueue SUBMIT với snapshotId vừa tạo
		const command: SubmitCommand = {
			type: 'SUBMIT',
			distributionId,
			key,
			create: {
				id: distributionId,
				releaseId: input.releaseId,
				snapshotId,
				tenantId: input.tenantId,
				type: input.type,
				correlationId,
				channelSpecs: input.channelSpecs as never,
			},
		};

		const opts: EnqueueOptions = {
			jobId: `${distributionId}:SUBMIT:${key}`,
			attempts: 1, // SUBMIT idempotent, không retry
		};

		await this.workflowEngine.enqueue(
			QUEUES.ORCHESTRATE,
			{ distributionId, correlationId, key, command },
			opts,
		);

		return distributionId;
	}
}
