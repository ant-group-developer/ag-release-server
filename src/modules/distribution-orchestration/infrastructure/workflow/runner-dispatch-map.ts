import { Injectable } from '@nestjs/common';

import { DistributionCommand } from '../../application/commands/distribution.command';
import { OrchestrateHandler } from '../../application/orchestrate.handler';
import {
	JobPayload,
	QUEUES,
	QueueName,
} from '../../application/ports/workflow-engine.port';
import { BuildPackageRunner } from '../../application/step-runners/build-package.runner';
import { CiImportCheckRunner } from '../../application/step-runners/ci-import-check.runner';
import { ExportBatchRunner } from '../../application/step-runners/export-batch.runner';
import { ProvisionIdRunner } from '../../application/step-runners/provision-id.runner';
import { QaRunner } from '../../application/step-runners/qa.runner';
import { SftpUploadRunner } from '../../application/step-runners/sftp-upload.runner';
import { StatusSyncRunner } from '../../application/step-runners/status-sync.runner';
import { ValidateRunner } from '../../application/step-runners/validate.runner';

/**
 * RunnerDispatchMap — map QueueName → runner/handler dispatch function.
 *
 * Trung tâm routing cho DistributionWorkerService. Tách khỏi worker lifecycle
 * để dễ test và maintain. Mỗi queue có 1 dispatch function:
 *
 * - `dist.orchestrate`: gọi OrchestrateHandler.handle(payload.command)
 * - `dist.validate`: gọi ValidateRunner.run(payload) → command
 * - 7 runner queues: gọi runner.run(payload) → command | null
 *
 * Runner trả command → worker enqueue lại vào `dist.orchestrate`.
 * Runner trả null → worker enqueue lại vào queue hiện tại với delay (re-poll).
 */
@Injectable()
export class RunnerDispatchMap {
	constructor(
		private readonly handler: OrchestrateHandler,
		private readonly validateRunner: ValidateRunner,
		private readonly provisionIdRunner: ProvisionIdRunner,
		private readonly buildPackageRunner: BuildPackageRunner,
		private readonly sftpUploadRunner: SftpUploadRunner,
		private readonly ciImportCheckRunner: CiImportCheckRunner,
		private readonly qaRunner: QaRunner,
		private readonly exportBatchRunner: ExportBatchRunner,
		private readonly statusSyncRunner: StatusSyncRunner,
	) {}

	/**
	 * Dispatch job theo queue.
	 * @returns command để enqueue lại vào dist.orchestrate, hoặc null để re-poll
	 */
	async dispatch(
		queue: QueueName,
		payload: JobPayload,
	): Promise<DistributionCommand | null> {
		switch (queue) {
			case QUEUES.ORCHESTRATE:
				// Orchestrate queue: payload.command chứa DistributionCommand
				if (!payload.command) {
					throw new Error(
						`dist.orchestrate job missing command: ${payload.key}`,
					);
				}
				await this.handler.handle(
					payload.command as DistributionCommand,
				);
				return null; // handler không trả command, chỉ persist state

			case QUEUES.VALIDATE:
				return this.validateRunner.run(payload);

			case QUEUES.PROVISION_ID:
				return this.provisionIdRunner.run(payload);

			case QUEUES.BUILD_PACKAGE:
				return this.buildPackageRunner.run(payload);

			case QUEUES.SFTP_UPLOAD:
				return this.sftpUploadRunner.run(payload as any);

			case QUEUES.CI_IMPORT_CHECK:
				return this.ciImportCheckRunner.run(payload as any);

			case QUEUES.CI_QA_CHECK:
				return this.qaRunner.run(payload as any);

			case QUEUES.EXPORT_BATCH:
				return this.exportBatchRunner.run(payload as any);

			case QUEUES.STATUS_SYNC:
				return this.statusSyncRunner.run(payload as any);

			default:
				// TypeScript exhaustiveness check — should never reach
				const _exhaustive: never = queue;
				throw new Error(`Unknown queue: ${_exhaustive}`);
		}
	}
}
