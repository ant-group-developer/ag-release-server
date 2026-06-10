import { Injectable } from '@nestjs/common';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import {
	DEFAULT_WAIT_MINUTES,
	MINUTES_PER_DAY,
} from 'src/common/constants/common.default.constants';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { EntityManager, Repository } from 'typeorm';
import { ReleaseExecutionStep3 } from '../entites/release-execution3-step.entity';
import { ReleaseExecution3 } from '../entites/release-execution3.entity';
import { ReleaseExecutionStepType } from '../enums/release-execution3.enum';

@Injectable()
export class ReleaseExecution3Builder {
	constructor(
		@InjectRepository(ReleaseExecutionStep3)
		private readonly stepRepo: Repository<ReleaseExecutionStep3>,

		@InjectEntityManager()
		private readonly manager: EntityManager,
	) {}

	async buildStepsChild({
		step: STEP,
		releaseExecution,
	}: {
		step?: ReleaseExecutionStep3;
		releaseExecution: ReleaseExecution3;
	}) {
		// : Promise<ReleaseExecutionStep3[]>
		const { releaseSnapshot } = releaseExecution.metadata.input;
		const stepResult: Partial<ReleaseExecutionStep3>[] = [];

		switch (STEP?.type) {
			case undefined: {
				let order = 1;

				if (!releaseSnapshot.upc) {
					stepResult.push({
						type: ReleaseExecutionStepType.GEN_UPC,
						order: order++,
						metadata: {
							input: { releaseId: releaseSnapshot.id },
						},
					});
				}

				const trackIdsWithoutIsrc =
					releaseSnapshot.tracks
						?.filter((track) => !track.isrc)
						.map((track) => track.id) ?? [];
				const videoIdWithoutIsrc =
					releaseSnapshot.video && !releaseSnapshot.video.isrc
						? releaseSnapshot.video.id
						: null;

				if (trackIdsWithoutIsrc.length > 0 || videoIdWithoutIsrc) {
					stepResult.push({
						type: ReleaseExecutionStepType.GEN_ISRCS,
						order: order++,
						metadata: {
							input: {
								trackIds: trackIdsWithoutIsrc,
								videoId: videoIdWithoutIsrc,
							},
						},
					});
				}

				stepResult.push(
					{
						type: ReleaseExecutionStepType.VALIDATE,
						order: order++,
					},
					{
						type: ReleaseExecutionStepType.PROCESS_DSPS,
						order: order++,
						childExecutionMode: 'parallel',
						isDeliveryStep: true,
						metadata: {
							input: {
								delivery:
									releaseExecution.metadata.input.delivery
										?.all,
							},
						},
					},
				);

				break;
			}

			case ReleaseExecutionStepType.GEN_ISRCS: {
				const trackIds: string[] = STEP.metadata?.input?.trackIds ?? [];
				trackIds.forEach((trackId, index) => {
					stepResult.push({
						type: ReleaseExecutionStepType.GEN_ISRC,
						order: index + 1,
						metadata: { input: { trackId } },
					});
				});

				const videoId: string | null =
					STEP.metadata?.input?.videoId ?? null;
				if (videoId) {
					stepResult.push({
						type: ReleaseExecutionStepType.GEN_ISRC,
						order: trackIds.length + 1,
						metadata: { input: { videoId } },
					});
				}
				break;
			}

			case ReleaseExecutionStepType.PROCESS_DSPS: {
				const { dspDirect, dspAggregator } =
					releaseExecution.metadata.input;

				if (dspDirect?.length) {
					stepResult.push({
						type: ReleaseExecutionStepType.PROCESS_DIRECT,
						order: 1,
						metadata: { input: { dsps: dspDirect } },
						childExecutionMode: 'parallel',
					});
				}

				if (dspAggregator?.ci?.ci?.length) {
					stepResult.push({
						type: ReleaseExecutionStepType.PROCESS_AGG,
						order: 2,
						metadata: { input: { dsps: dspAggregator.ci.ci } },
						childExecutionMode: 'parallel',
					});
				}
				break;
			}

			case ReleaseExecutionStepType.PROCESS_DIRECT: {
				const dsps: Dsp[] = STEP.metadata?.input?.dsps ?? [];

				dsps.forEach((dsp, index) => {
					stepResult.push(
						{
							type: ReleaseExecutionStepType.PROCESS_DIRECT_CHILD,
							order: index + 1,
							isDeliveryStep: true,
							metadata: {
								input: {
									dsp,
									delivery:
										releaseExecution.metadata.input.delivery
											?.directByDspId?.[dsp.id],
								},
							},
						},
						// {
						// 	type: ReleaseExecutionStepType.SYNC_RESULT_TO_RELEASE,
						// 	order: index + 2,
						// 	metadata: { input: { dsp } },
						// }
					);
				});
				break;
			}

			case ReleaseExecutionStepType.PROCESS_DIRECT_CHILD:
				stepResult.push(
					{
						type: ReleaseExecutionStepType.CREATE_METADATA_ON_SERVER,
						order: 1,
						metadata: { input: { dsp: STEP.metadata?.input?.dsp } },
					},
					{
						type: ReleaseExecutionStepType.UPLOAD_METADATA_TO_SFTP,
						order: 2,
						metadata: { input: { dsp: STEP.metadata?.input?.dsp } },
					},
					{
						type: ReleaseExecutionStepType.WAIT_PARTNER_PROCESS,
						order: 3,
						metadata: {
							input: {
								dsp: STEP.metadata?.input?.dsp,
								waitMinutes: DEFAULT_WAIT_MINUTES,
							},
						},
					},
					{
						type: ReleaseExecutionStepType.SYNC_DATA_PARTNER,
						order: 4,
						metadata: {
							input: {
								dsp: STEP.metadata?.input?.dsp,
							},
						},
					},
				);
				break;

			case ReleaseExecutionStepType.PROCESS_AGG: {
				stepResult.push({
					type: ReleaseExecutionStepType.PROCESS_AGG_CI,
					order: 1,
					isDeliveryStep: true,
					metadata: {
						input: {
							delivery:
								releaseExecution.metadata.input.delivery?.aggCi,
						},
					},
				});

				break;
			}

			case ReleaseExecutionStepType.PROCESS_AGG_CI: {
				const { dspAggregator } = releaseExecution.metadata.input;

				const ciDsps = [
					...(dspAggregator?.ci?.ci ?? []),
					...(dspAggregator?.ci?.state51 ?? []),
				];

				if (ciDsps.length) {
					stepResult.push(
						{
							type: ReleaseExecutionStepType.IMPORT_CI,
							order: 1,
							metadata: {
								input: {
									dsps: ciDsps,
									primaryDsp:
										dspAggregator?.ci?.primaryDsp ?? null,
								},
							},
						},
						{
							type: ReleaseExecutionStepType.EXPORT_CI,
							order: 2,
							childExecutionMode: 'parallel',
						},
						{
							type: ReleaseExecutionStepType.WAIT_PARTNER_PROCESS,
							order: 3,
							metadata: {
								input: {
									waitMinutes: MINUTES_PER_DAY,
								},
							},
						},
						{
							type: ReleaseExecutionStepType.SYNC_DATA_DSP_CI,
							order: 4,
							metadata: {
								input: {
									dspCiCodes: ciDsps
										.map((dsp) => dsp.codeCi)
										.filter(
											(code): code is string => !!code,
										),
								},
							},
						},
					);
				}

				break;
			}

			case ReleaseExecutionStepType.IMPORT_CI:
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

			case ReleaseExecutionStepType.EXPORT_CI: {
				const ciDsps =
					releaseExecution.metadata.input.dspAggregator?.ci?.ci ?? [];
				const state51Dsps =
					releaseExecution.metadata.input.dspAggregator?.ci
						?.state51 ?? [];

				if (ciDsps.length > 0) {
					stepResult.push({
						type: ReleaseExecutionStepType.EXPORT_AGG_CI_CI,
						order: 1,
						metadata: { input: { dsps: ciDsps } },
					});
				}

				if (state51Dsps.length > 0) {
					stepResult.push({
						type: ReleaseExecutionStepType.EXPORT_AGG_CI_STATE51,
						order: 2,
						metadata: { input: { dsps: state51Dsps } },
					});
				}
				break;
			}

			case ReleaseExecutionStepType.EXPORT_AGG_CI_CI: {
				const dsps = STEP?.metadata?.input?.dsps ?? [];
				const { upc } = releaseSnapshot;

				stepResult.push({
					type: ReleaseExecutionStepType.WAITING_ADMIN_EXPORT,
					order: 1,
					metadata: { input: { upc, dsps } },
				});
				break;
			}

			case ReleaseExecutionStepType.EXPORT_AGG_CI_STATE51: {
				const dsps = STEP?.metadata?.input?.dsps ?? [];

				stepResult.push({
					type: ReleaseExecutionStepType.SEND_EMAIL_STATE51,
					order: 1,
					metadata: {
						input: {
							upc: releaseSnapshot.upc,
							dsps,
						},
					},
				});
				break;
			}

			default:
				return [];
		}

		// Gán id, parentStepId, releaseExecutionId rồi đệ quy
		// const savedSteps: ReleaseExecutionStep3[] = [];

		for (const childStep of stepResult) {
			childStep.releaseExecutionId = releaseExecution.id;
			childStep.parentStepId = STEP?.id ?? null;
		}

		const stepDb = await this.stepRepo.save(stepResult);
		// console.log('save: ', stepDb.length)

		for (const childStep of stepDb) {
			const children = await this.buildStepsChild({
				step: childStep,
				releaseExecution,
			});

			childStep.childSteps = children;
			// savedSteps.push(childStep as ReleaseExecutionStep3);
		}

		return stepDb;
	}
}
