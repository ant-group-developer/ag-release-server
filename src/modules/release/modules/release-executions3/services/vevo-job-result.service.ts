import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { GetCiToolVevoJobResponse } from 'src/modules/partners-api/ci/interfaces/vevo-video.interface';
import { Repository } from 'typeorm';
import { ReleaseExecutionStep3 } from '../entites/release-execution3-step.entity';
import {
	ReleaseExecutionStepStatus,
	ReleaseExecutionStepType,
} from '../enums/release-execution3.enum';

export type VevoJobResultSource = 'webhook' | 'polling';

export interface ProcessVevoJobResultResponse {
	matched: boolean;
	terminal: boolean;
	duplicate: boolean;
	jobId: string;
	reason?: string;
	submitStepId?: string;
	waitStepId?: string;
	releaseExecutionId?: string;
	state?: string;
	status?: ReleaseExecutionStepStatus;
	success?: boolean;
	error?: string | null;
}

@Injectable()
export class VevoJobResultService {
	constructor(
		@InjectRepository(ReleaseExecutionStep3)
		private readonly releaseExecutionStepRepo: Repository<ReleaseExecutionStep3>,
	) {}

	async processJobResult({
		job,
		source,
		waitStep,
	}: {
		job: GetCiToolVevoJobResponse;
		source: VevoJobResultSource;
		waitStep?: ReleaseExecutionStep3;
	}): Promise<ProcessVevoJobResultResponse> {
		const submitStep = await this.findSubmitStepByJobId(job.id);

		if (!submitStep) {
			return {
				matched: false,
				terminal: false,
				duplicate: false,
				jobId: job.id,
				reason: 'SUBMIT_VEVO_VIDEO_NOT_FOUND',
			};
		}

		const resolvedWaitStep =
			waitStep ?? (await this.findWaitStep(submitStep));

		if (!resolvedWaitStep) {
			return {
				matched: false,
				terminal: false,
				duplicate: false,
				jobId: job.id,
				reason: 'WAIT_PARTNER_PROCESS_NOT_FOUND',
				submitStepId: submitStep.id,
				releaseExecutionId: submitStep.releaseExecutionId,
			};
		}

		if (
			resolvedWaitStep.status === ReleaseExecutionStepStatus.DONE ||
			resolvedWaitStep.status === ReleaseExecutionStepStatus.FAILED
		) {
			return {
				matched: true,
				terminal: true,
				duplicate: true,
				jobId: job.id,
				submitStepId: submitStep.id,
				waitStepId: resolvedWaitStep.id,
				releaseExecutionId: submitStep.releaseExecutionId,
				state: job.state,
				status: resolvedWaitStep.status,
				success:
					resolvedWaitStep.status === ReleaseExecutionStepStatus.DONE,
			};
		}

		const terminal = job.state === 'completed' || job.state === 'failed';

		if (!terminal) {
			return {
				matched: true,
				terminal: false,
				duplicate: false,
				jobId: job.id,
				submitStepId: submitStep.id,
				waitStepId: resolvedWaitStep.id,
				releaseExecutionId: submitStep.releaseExecutionId,
				state: job.state,
				status: ReleaseExecutionStepStatus.WAITING_PARTNER,
			};
		}

		const success =
			job.state === 'completed' && job.result?.success === true;
		const error = success
			? null
			: job.result?.errors
					?.map((item) => `${item.code}: ${item.message}`)
					.join('; ') || 'CI Tool VEVO queue job failed';

		resolvedWaitStep.metadata = {
			...resolvedWaitStep.metadata,
			output: {
				...resolvedWaitStep.metadata?.output,
				jobId: job.id,
				state: job.state,
				success,
				error,
				source,
				...(source === 'webhook'
					? { callback: job }
					: { polledJob: job }),
				receivedAt: new Date().toISOString(),
			},
		};

		delete resolvedWaitStep.metadata.scheduledAt;

		resolvedWaitStep.status = success
			? ReleaseExecutionStepStatus.DONE
			: ReleaseExecutionStepStatus.FAILED;
		resolvedWaitStep.completedAt = new Date();

		await this.releaseExecutionStepRepo.save(resolvedWaitStep);

		return {
			matched: true,
			terminal: true,
			duplicate: false,
			jobId: job.id,
			submitStepId: submitStep.id,
			waitStepId: resolvedWaitStep.id,
			releaseExecutionId: submitStep.releaseExecutionId,
			state: job.state,
			status: resolvedWaitStep.status,
			success,
			error,
		};
	}

	private findSubmitStepByJobId(
		jobId: string,
	): Promise<ReleaseExecutionStep3 | null> {
		return this.releaseExecutionStepRepo
			.createQueryBuilder('step')
			.where('step.type = :stepType', {
				stepType: ReleaseExecutionStepType.SUBMIT_VEVO_VIDEO,
			})
			.andWhere(`step.metadata -> 'output' ->> 'jobId' = :jobId`, {
				jobId,
			})
			.orderBy('step.createdAt', 'DESC')
			.getOne();
	}

	private findWaitStep(
		submitStep: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStep3 | null> {
		if (!submitStep.parentStepId) {
			return Promise.resolve(null);
		}

		return this.releaseExecutionStepRepo.findOne({
			where: {
				releaseExecutionId: submitStep.releaseExecutionId,
				parentStepId: submitStep.parentStepId,
				type: ReleaseExecutionStepType.WAIT_PARTNER_PROCESS,
			},
		});
	}
}
