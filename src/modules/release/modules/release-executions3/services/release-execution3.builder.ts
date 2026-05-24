import { Injectable } from '@nestjs/common';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { DEFAULT_WAIT_MINUTES } from 'src/common/constants/common.default.constants';
import { EntityManager, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ReleaseExecutionStep3 } from '../entites/release-execution3-step.entity';
import { ReleaseExecution3 } from '../entites/release-execution3.entity';
import {
	ReleaseExecutionStatus,
	ReleaseExecutionStepType,
} from '../enums/release-execution3.enum';

/** 24 hours — CI export takes much longer than direct partner processing */
const WAIT_CI_EXPORT_MINUTES = 1440;

type PartialStep = Partial<ReleaseExecutionStep3>;

@Injectable()
export class ReleaseExecution3Builder {
	constructor(
		@InjectRepository(ReleaseExecution3)
		private readonly executionRepo: Repository<ReleaseExecution3>,

		@InjectRepository(ReleaseExecutionStep3)
		private readonly stepRepo: Repository<ReleaseExecutionStep3>,

		@InjectEntityManager()
		private readonly manager: EntityManager,
	) {}

	async startProcessing(executionId: string): Promise<void> {
		const execution = await this.executionRepo.findOne({
			where: { id: executionId },
		});

		if (!execution) {
			throw new Error('Execution not found');
		}

		await this.executionRepo.update(executionId, {
			status: ReleaseExecutionStatus.PROCESSING,
		});

		const allSteps = this.buildStepsChild({ releaseExecution: execution });

		await this.manager.transaction(async (tx) => {
			await this.saveStepsRecursive(allSteps, tx);
		});
	}

	buildStepsChild({
		step,
		releaseExecution,
	}: {
		step?: ReleaseExecutionStep3;
		releaseExecution: ReleaseExecution3;
	}): ReleaseExecutionStep3[] {
		const { releaseSnapshot } = releaseExecution.metadata.input;
		const stepResult: Partial<ReleaseExecutionStep3>[] = [];

		switch (step?.type) {
			case undefined:
				stepResult.push(
					{
						type: ReleaseExecutionStepType.GEN_UPC,
						order: 1,
						metadata: {
							input: { releaseId: releaseSnapshot.id },
						},
					},
					{
						type: ReleaseExecutionStepType.GEN_ISRCS,
						order: 2,
						metadata: {
							input: {
								trackIds: releaseSnapshot.tracks.map(
									(t) => t.id,
								),
							},
						},
					},
					{
						type: ReleaseExecutionStepType.VALIDATE,
						order: 3,
					},
					{
						type: ReleaseExecutionStepType.PROCESS_DSPS,
						order: 4,
					},
				);
				break;

			case ReleaseExecutionStepType.GEN_ISRCS: {
				const trackIds: string[] =
					step?.parentStep?.metadata?.input?.trackIds ?? [];
				trackIds.forEach((trackId, index) => {
					stepResult.push({
						type: ReleaseExecutionStepType.GEN_ISRC,
						order: index + 1,
						metadata: { input: { trackId } },
					});
				});
				break;
			}

			case ReleaseExecutionStepType.PROCESS_DSPS:
				stepResult.push(
					{ type: ReleaseExecutionStepType.PROCESS_DIRECT, order: 1 },
					{ type: ReleaseExecutionStepType.PROCESS_AGG, order: 2 },
				);
				break;

			case ReleaseExecutionStepType.PROCESS_DIRECT: {
				const dspDirect =
					releaseExecution.metadata.input.dspDirect ?? [];
				dspDirect.forEach((dsp, index) => {
					stepResult.push({
						type: ReleaseExecutionStepType.PROCESS_DIRECT_CHILD,
						order: index + 1,
						metadata: { input: { dsp } },
					});
				});
				break;
			}

			case ReleaseExecutionStepType.PROCESS_DIRECT_CHILD:
				stepResult.push(
					{
						type: ReleaseExecutionStepType.CREATE_METADATA_ON_SERVER,
						order: 1,
					},
					{
						type: ReleaseExecutionStepType.UPLOAD_METADATA_TO_SFTP,
						order: 2,
					},
					{
						type: ReleaseExecutionStepType.WAIT_PARTNER_PROCESS,
						order: 3,
						metadata: {
							input: { waitMinutes: DEFAULT_WAIT_MINUTES },
						},
					},
					{
						type: ReleaseExecutionStepType.SYNC_DATA_PARTNER,
						order: 4,
					},
				);
				break;

			case ReleaseExecutionStepType.PROCESS_AGG:
				stepResult.push({
					type: ReleaseExecutionStepType.PROCESS_AGG_CI,
					order: 1,
				});
				break;

			case ReleaseExecutionStepType.PROCESS_AGG_CI:
				stepResult.push(
					{ type: ReleaseExecutionStepType.IMPORT, order: 1 },
					{ type: ReleaseExecutionStepType.EXPORT, order: 2 },
				);
				break;

			case ReleaseExecutionStepType.IMPORT:
				stepResult.push(
					{
						type: ReleaseExecutionStepType.CREATE_METADATA_ON_SERVER,
						order: 1,
					},
					{
						type: ReleaseExecutionStepType.UPLOAD_METADATA_TO_SFTP,
						order: 2,
					},
					{
						type: ReleaseExecutionStepType.CREATE_FOLDER_DONE_CI,
						order: 3,
					},
					{
						type: ReleaseExecutionStepType.WAIT_PARTNER_PROCESS,
						order: 4,
						metadata: {
							input: { waitMinutes: DEFAULT_WAIT_MINUTES },
						},
					},
					{ type: ReleaseExecutionStepType.VALIDATE_QA_CI, order: 5 },
				);
				break;

			case ReleaseExecutionStepType.EXPORT:
				if (
					releaseExecution.metadata.input.dspAggregator.ci.ci.length >
					0
				) {
					stepResult.push({
						type: ReleaseExecutionStepType.CI,
						order: 1,
					});
				}

				if (
					releaseExecution.metadata.input.dspAggregator.ci.state51
						.length > 0
				) {
					stepResult.push({
						type: ReleaseExecutionStepType.STATE51,
						order: 2,
					});
				}
				break;

			case ReleaseExecutionStepType.CI:
				const upc =
					releaseSnapshot.upc ??
					releaseExecution.metadata.input
						.upcAutoIfReleaseSnapshotNull;
				const ciDspsInput = step.metadata?.input?.ciDealDsps ?? [];
				stepResult.push({
					type: ReleaseExecutionStepType.WAITING_ADMIN_EXPORT,
					order: 1,
					metadata: { input: { upc, dsps: ciDspsInput } },
				});
				break;

			case ReleaseExecutionStepType.STATE51:
				// const state51DspsInput =
				// step.metadata?.input?.state51Dsps ?? [];
				stepResult.push({
					type: ReleaseExecutionStepType.SEND_EMAIL_STATE51,
					order: 1,
					metadata: {
						input: {
							upc: releaseSnapshot.upc,
							// dsps: state51DspsInput,
						},
					},
				});
				break;

			default:
				return [];
		}

		// Gán id, parentStepId, releaseExecutionId rồi đệ quy
		const savedSteps: ReleaseExecutionStep3[] = [];

		for (const childStep of stepResult) {
			childStep.id = uuidv4();
			childStep.releaseExecutionId = releaseExecution.id;
			childStep.parentStepId = step?.id ?? null;

			const children = this.buildStepsChild({
				step: childStep as ReleaseExecutionStep3,
				releaseExecution,
			});

			childStep.childSteps = children;
			savedSteps.push(childStep as ReleaseExecutionStep3);
		}

		return savedSteps;
	}

	private async saveStepsRecursive(
		steps: ReleaseExecutionStep3[],
		tx: EntityManager,
	): Promise<void> {
		for (const step of steps) {
			const children = step.childSteps;
			step.childSteps = undefined;

			await tx.save(ReleaseExecutionStep3, step);

			if (children?.length) {
				await this.saveStepsRecursive(children, tx);
			}
		}
	}
}
