import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import { LogsService } from 'src/modules/log/services/logs.services';
import { Repository } from 'typeorm';
import { ReleaseExecutionStep3 } from '../entites/release-execution3-step.entity';
import { ReleaseExecutionStepType } from '../enums/release-execution3.enum';

type StepTaskContext = {
	step: ReleaseExecutionStep3;
};

@Injectable()
export class ReleaseExecution3CleanupService {
	constructor(
		@InjectRepository(ReleaseExecutionStep3)
		private readonly stepRepo: Repository<ReleaseExecutionStep3>,
		private readonly logService: LogsService,
	) {}

	public async cleanupStepTask(context: StepTaskContext): Promise<void> {
		const { step } = context;

		switch (step.type) {
			case ReleaseExecutionStepType.CREATE_METADATA_ON_SERVER:
				await this.cleanupCreateMetadataOnServer(context);
				break;

			case ReleaseExecutionStepType.UPLOAD_METADATA_TO_SFTP:
				await this.cleanupUploadMetadataToSftpLocal(context);
				break;

			default:
				break;
		}
	}

	private async cleanupCreateMetadataOnServer(context: StepTaskContext) {
		const outputDir = context.step.metadata?.output?.outputDir;
		if (outputDir && fs.existsSync(outputDir)) {
			await fs.promises.rm(outputDir, { recursive: true, force: true });

			this.logService.success({
				message: `[CLEANUP_STEP] Cleaned up local directory: ${outputDir}`,
				releaseExecutionId: context.step.releaseExecutionId,
				releaseExecutionStepId: context.step.id,
			});
		}
	}

	private async cleanupUploadMetadataToSftpLocal(context: StepTaskContext) {
		const { step } = context;
		if (!step.parentStepId) return;

		const createMetadataStep = await this.stepRepo.findOne({
			where: {
				parentStepId: step.parentStepId,
				type: ReleaseExecutionStepType.CREATE_METADATA_ON_SERVER,
			},
		});

		const outputDir = createMetadataStep?.metadata?.output?.outputDir;
		if (outputDir && fs.existsSync(outputDir)) {
			await fs.promises.rm(outputDir, { recursive: true, force: true });

			this.logService.success({
				message: `[CLEANUP_STEP] Cleaned up local directory for stuck upload: ${outputDir}`,
				releaseExecutionId: context.step.releaseExecutionId,
				releaseExecutionStepId: context.step.id,
			});
		}
	}
}
