import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { Release } from 'src/modules/release/entities/release.entity';
import { EntityManager } from 'typeorm';
import { ReleaseExecutionStep3 } from '../entites/release-execution3-step.entity';
import {
	ReleaseExecutionStepStatus,
	ReleaseExecutionStepType,
} from '../enums/release-execution3.enum';

@Injectable()
export class ReleaseExecution3Worker {
	constructor(
		@InjectEntityManager()
		private readonly manager: EntityManager,
	) {}

	async dispatchStepTask(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		switch (step.type) {
			case ReleaseExecutionStepType.GEN_UPC:
				return this.genUpc(step);

			case ReleaseExecutionStepType.GEN_ISRCS:
				return this.genIsrcs(step);

			case ReleaseExecutionStepType.GEN_ISRC:
				return this.genIsrc(step);

			case ReleaseExecutionStepType.VALIDATE:
				return this.validate(step);

			// case ReleaseExecutionStepType.CREATE_AND_UPLOAD_DIRECT:
			// 	return this.createAndUploadDirect(step);

			// case ReleaseExecutionStepType.SYNC_DATA_FROM_DSP:
			// 	return this.syncDataFromDsp(step);

			// case ReleaseExecutionStepType.CREATE_AND_UPLOAD_CI:
			// 	return this.createAndUploadCi(step);

			case ReleaseExecutionStepType.CREATE_FOLDER_DONE_CI:
				return this.createFolderDoneCi(step);

			case ReleaseExecutionStepType.VALIDATE_QA_CI:
				return this.validateQaCi(step);

			// case ReleaseExecutionStepType.EXPORT_CI:
			// 	return this.exportCi(step);

			// case ReleaseExecutionStepType.SEND_EMAIL_TO_STATE:
			// 	return this.sendEmailToState(step);

			case ReleaseExecutionStepType.WAITING_ADMIN_EXPORT:
				return ReleaseExecutionStepStatus.WAITING_ACTION;

			case ReleaseExecutionStepType.WAIT_PARTNER_PROCESS:
				return ReleaseExecutionStepStatus.WAITING_PARTNER;

			case ReleaseExecutionStepType.SYNC_DATA_DSP_CI:
				return this.syncDataDspCi(step);

			case ReleaseExecutionStepType.PROCESS_DIRECT:
			case ReleaseExecutionStepType.PROCESS_AGG_CI:
				return this.deriveStatusFromChildren(step);

			default:
				throw new Error(`Unsupported step type: ${step.type}`);
		}
	}

	private async genUpc(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		try {
			const releaseId =
				step.releaseExecution?.metadata?.input?.releaseSnapshot?.id;

			if (!releaseId) {
				return ReleaseExecutionStepStatus.FAILED;
			}

			const upc = `UPC_${Date.now()}`;

			await this.manager.update(Release, { id: releaseId }, { upc });

			step.metadata = {
				...step.metadata,
				output: {
					upc,
				},
			};

			return ReleaseExecutionStepStatus.DONE;
		} catch {
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async genIsrcs(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		return this.deriveStatusFromChildren(step);
	}

	private async genIsrc(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		try {
			return ReleaseExecutionStepStatus.DONE;
		} catch {
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async validate(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		try {
			return ReleaseExecutionStepStatus.DONE;
		} catch {
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async createAndUploadDirect(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		try {
			return ReleaseExecutionStepStatus.DONE;
		} catch {
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async syncDataFromDsp(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		try {
			return ReleaseExecutionStepStatus.DONE;
		} catch {
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async createAndUploadCi(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		try {
			return ReleaseExecutionStepStatus.DONE;
		} catch {
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async createFolderDoneCi(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		try {
			return ReleaseExecutionStepStatus.DONE;
		} catch {
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async validateQaCi(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		try {
			return ReleaseExecutionStepStatus.DONE;
		} catch {
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async exportCi(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		try {
			return ReleaseExecutionStepStatus.DONE;
		} catch {
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async sendEmailToState(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		try {
			return ReleaseExecutionStepStatus.DONE;
		} catch {
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async syncDataDspCi(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		try {
			return ReleaseExecutionStepStatus.DONE;
		} catch {
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private deriveStatusFromChildren(
		step: ReleaseExecutionStep3,
	): ReleaseExecutionStepStatus {
		const children = step.childSteps || [];

		if (!children.length) {
			return step.status;
		}

		if (
			children.some(
				(c) => c.status === ReleaseExecutionStepStatus.WAITING_ACTION,
			)
		) {
			return ReleaseExecutionStepStatus.WAITING_ACTION;
		}

		if (
			children.some(
				(c) => c.status === ReleaseExecutionStepStatus.WAITING_PARTNER,
			)
		) {
			return ReleaseExecutionStepStatus.WAITING_PARTNER;
		}

		if (
			children.some((c) => c.status === ReleaseExecutionStepStatus.FAILED)
		) {
			return ReleaseExecutionStepStatus.FAILED;
		}

		if (
			children.every(
				(c) => c.status === ReleaseExecutionStepStatus.CANCELLED,
			)
		) {
			return ReleaseExecutionStepStatus.CANCELLED;
		}

		if (
			children.every((c) => c.status === ReleaseExecutionStepStatus.DONE)
		) {
			return ReleaseExecutionStepStatus.DONE;
		}

		return ReleaseExecutionStepStatus.PROCESSING;
	}
}
