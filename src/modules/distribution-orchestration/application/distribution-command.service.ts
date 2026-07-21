import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { SubmitCommand } from './commands/distribution.command';
import {
	EnqueueOptions,
	QUEUES,
	WORKFLOW_ENGINE,
	WorkflowEnginePort,
} from './ports/workflow-engine.port';

/**
 * DistributionCommandService — entry point cho HTTP → queue.
 *
 * Khối A chỉ implement `submit`. Khối B/E sẽ thêm `approveReview`/`rejectReview`/`retry`.
 * Service này enqueue command vào `dist.orchestrate` qua WorkflowEnginePort.
 */
@Injectable()
export class DistributionCommandService {
	constructor(
		@Inject(WORKFLOW_ENGINE)
		private readonly workflowEngine: WorkflowEnginePort,
	) {}

	/**
	 * Submit distribution — tạo snapshot + enqueue SUBMIT command.
	 *
	 * @param input - release metadata để tạo distribution
	 * @returns distributionId
	 */
	async submit(input: {
		releaseId: string;
		snapshotId: string;
		tenantId: string;
		type: string; // ExecutionTypeEnum: 'INITIAL' | 'UPDATE' | 'TAKEDOWN'
		correlationId: string;
		channelSpecs: any[]; // ChannelDeliverySpec[]
	}): Promise<string> {
		const distributionId = uuidv4();
		const key = `submit:${Date.now()}`;

		const command: SubmitCommand = {
			type: 'SUBMIT',
			distributionId,
			key,
			create: {
				id: distributionId,
				releaseId: input.releaseId,
				snapshotId: input.snapshotId,
				tenantId: input.tenantId,
				type: input.type as any,
				correlationId: input.correlationId,
				channelSpecs: input.channelSpecs,
			},
		};

		const opts: EnqueueOptions = {
			jobId: `${distributionId}:SUBMIT:${key}`,
			attempts: 1, // SUBMIT idempotent, không retry
		};

		await this.workflowEngine.enqueue(
			QUEUES.ORCHESTRATE,
			{
				distributionId,
				correlationId: input.correlationId,
				key,
				command,
			},
			opts,
		);

		return distributionId;
	}
}
