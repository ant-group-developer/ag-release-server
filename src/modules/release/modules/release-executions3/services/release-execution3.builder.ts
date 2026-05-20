import { Injectable } from '@nestjs/common';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { DEFAULT_WAIT_MINUTES } from 'src/common/constants/common.default.constants';
import { RoutingModeEnum } from 'src/modules/distribution/dsp-routing/enum/dsp-routing.enum';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { EntityManager, In, Repository } from 'typeorm';
import { ReleaseExecutionStep3 } from '../entites/release-execution3-step.entity';
import { ReleaseExecution3 } from '../entites/release-execution3.entity';
import {
	ExecutionStepFailurePolicy,
	ExecutionStepMode,
	ReleaseExecutionStepType,
} from '../enums/release-execution3.enum';

// pipeline-definition.ts

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

	private PIPELINE_DEFINITION = {
		mode: ExecutionStepMode.SEQUENTIAL,
		failurePolicy: ExecutionStepFailurePolicy.STOP_ALL,

		children: [
			{
				type: ReleaseExecutionStepType.GEN_UPC,
				mode: ExecutionStepMode.SEQUENTIAL,
				failurePolicy: ExecutionStepFailurePolicy.STOP_ALL,
			},

			{
				type: ReleaseExecutionStepType.GEN_ISRCS,
				mode: ExecutionStepMode.PARALLEL,
				failurePolicy: ExecutionStepFailurePolicy.STOP_ALL,

				// children sinh động theo số track
			},

			{
				type: ReleaseExecutionStepType.VALIDATE,
				mode: ExecutionStepMode.SEQUENTIAL,
				failurePolicy: ExecutionStepFailurePolicy.STOP_ALL,
			},

			{
				type: ReleaseExecutionStepType.PROCESS_DIRECT,
				mode: ExecutionStepMode.SEQUENTIAL,
				failurePolicy: ExecutionStepFailurePolicy.ISOLATE,

				children: [
					{
						type: ReleaseExecutionStepType.CREATE_AND_UPLOAD_DIRECT,
						failurePolicy: ExecutionStepFailurePolicy.STOP_ALL,
					},

					{
						type: ReleaseExecutionStepType.WAIT_PARTNER_PROCESS,
						failurePolicy: ExecutionStepFailurePolicy.STOP_ALL,
					},

					{
						type: ReleaseExecutionStepType.SYNC_DATA_FROM_DSP,
						failurePolicy: ExecutionStepFailurePolicy.STOP_ALL,
					},
				],
			},

			{
				type: ReleaseExecutionStepType.PROCESS_AGG_CI,
				mode: ExecutionStepMode.SEQUENTIAL,
				failurePolicy: ExecutionStepFailurePolicy.ISOLATE,

				children: [
					{
						type: ReleaseExecutionStepType.CREATE_AND_UPLOAD_CI,
						failurePolicy: ExecutionStepFailurePolicy.STOP_ALL,
					},

					{
						type: ReleaseExecutionStepType.WAIT_PARTNER_PROCESS,
						failurePolicy: ExecutionStepFailurePolicy.STOP_ALL,
					},

					{
						type: ReleaseExecutionStepType.EXPORT_CI,
						mode: ExecutionStepMode.PARALLEL,
						failurePolicy: ExecutionStepFailurePolicy.ANY_SUCCESS,

						children: [
							{
								type: ReleaseExecutionStepType.SEND_EMAIL_TO_STATE,
							},

							{
								type: ReleaseExecutionStepType.WAITING_ADMIN_EXPORT,
							},
						],
					},

					{
						type: ReleaseExecutionStepType.SYNC_DATA_DSP_CI,
						failurePolicy: ExecutionStepFailurePolicy.STOP_ALL,
					},
				],
			},
		],
	};

	/**
	 * Chỉ build plan:
	 * - lấy execution + snapshot
	 * - tạo parent steps
	 * - tạo child steps
	 * - không chạy step nào
	 */
	async build(executionId: string, dspCodes: string[]): Promise<void> {
		const execution = await this.executionRepo.findOne({
			where: { id: executionId },
		});

		if (!execution) {
			throw new Error(`Release execution ${executionId} not found`);
		}

		const snapshot = execution.metadata?.input?.releaseSnapshot;

		const dsps = dspCodes?.length
			? await this.manager.find(Dsp, {
					where: { code: In(dspCodes) },
					relations: [
						'dspRoutingConfig',
						'dspRoutingConfig.aggregator',
					],
				})
			: [];

		const parentStepsToInsert: Partial<ReleaseExecutionStep3>[] = [
			...this.buildCriticalSteps({
				executionId,
				snapshot,
			}),
			...this.buildDirectSteps({
				executionId,
				dsps,
			}),
			...this.buildCiSteps({
				executionId,
				dsps,
				snapshot,
			}),
		];

		const orderedParentSteps = parentStepsToInsert.map((step, index) => ({
			...step,
			order: index + 1,
		}));

		const savedParents = await this.stepRepo.save(
			orderedParentSteps.map((step) => this.stepRepo.create(step)),
		);

		const childStepsToInsert = this.buildChildSteps({
			executionId,
			parents: savedParents,
			snapshot,
		});

		if (childStepsToInsert.length > 0) {
			await this.stepRepo.save(
				childStepsToInsert.map((step) => this.stepRepo.create(step)),
			);
		}
	}

	private buildCriticalSteps({
		executionId,
		snapshot,
	}: {
		executionId: string;
		snapshot: any;
	}): Partial<ReleaseExecutionStep3>[] {
		const steps: Partial<ReleaseExecutionStep3>[] = [];

		// upc
		if (!snapshot?.upc) {
			steps.push({
				releaseExecutionId: executionId,
				type: ReleaseExecutionStepType.GEN_UPC,
			});
		}

		// isrcs
		const tracksWithoutIsrc =
			snapshot?.tracks?.filter((track: Track) => !track.isrc) || [];

		if (tracksWithoutIsrc.length > 0) {
			steps.push({
				releaseExecutionId: executionId,
				type: ReleaseExecutionStepType.GEN_ISRCS,
				metadata: {
					input: {
						trackIds: tracksWithoutIsrc.map(
							(track: Track) => track.id,
						),
					},
				},
			});
		}

		// validate
		steps.push({
			releaseExecutionId: executionId,
			type: ReleaseExecutionStepType.VALIDATE,
		});

		return steps;
	}

	// direct
	private buildDirectSteps({
		executionId,
		dsps,
	}: {
		executionId: string;
		dsps: Dsp[];
	}): Partial<ReleaseExecutionStep3>[] {
		const directDsps = dsps.filter((dsp) => {
			const config = dsp.dspRoutingConfig;

			const isCi =
				config?.mode === RoutingModeEnum.AGGREGATOR &&
				config.aggregator?.code === 'CI';

			return !isCi;
		});

		return directDsps.map((dsp) => ({
			releaseExecutionId: executionId,
			type: ReleaseExecutionStepType.PROCESS_DIRECT,
			metadata: {
				input: {
					dsps: [dsp],
				},
			},
		}));
	}

	private buildCiSteps({
		executionId,
		dsps,
	}: {
		executionId: string;
		dsps: Dsp[];
		snapshot: Release;
	}): Partial<ReleaseExecutionStep3>[] {
		const ciDsps = dsps.filter((dsp) => {
			const config = dsp.dspRoutingConfig;

			return (
				config?.mode === RoutingModeEnum.AGGREGATOR &&
				config.aggregator?.code === 'CI'
			);
		});

		if (ciDsps.length === 0) return [];

		return [
			{
				releaseExecutionId: executionId,
				type: ReleaseExecutionStepType.PROCESS_AGG_CI,
				metadata: {
					input: {
						dsps: ciDsps,
					},
				},
			},
		];
	}

	private buildChildSteps({
		executionId,
		parents,
		snapshot,
	}: {
		executionId: string;
		parents: ReleaseExecutionStep3[];
		snapshot: Release;
	}): Partial<ReleaseExecutionStep3>[] {
		const childSteps: Partial<ReleaseExecutionStep3>[] = [];

		for (const parent of parents) {
			if (parent.type === ReleaseExecutionStepType.GEN_ISRCS) {
				const trackIds: string[] =
					parent.metadata?.input?.trackIds || [];

				trackIds.forEach((trackId, index) => {
					childSteps.push({
						releaseExecutionId: executionId,
						parentStepId: parent.id,
						type: ReleaseExecutionStepType.GEN_ISRC,
						order: index + 1,
						metadata: {
							input: {
								trackId,
							},
						},
					});
				});
			}

			if (parent.type === ReleaseExecutionStepType.PROCESS_DIRECT) {
				const directChildTypes = [
					ReleaseExecutionStepType.CREATE_AND_UPLOAD_DIRECT,
					ReleaseExecutionStepType.WAIT_PARTNER_PROCESS,
					ReleaseExecutionStepType.SYNC_DATA_FROM_DSP,
				];

				directChildTypes.forEach((type, index) => {
					childSteps.push({
						releaseExecutionId: executionId,
						parentStepId: parent.id,
						type,
						order: index + 1,
						...(type ===
						ReleaseExecutionStepType.WAIT_PARTNER_PROCESS
							? {
									metadata: {
										input: {
											waitMinutes: DEFAULT_WAIT_MINUTES,
										},
									},
								}
							: {}),
					});
				});
			}

			if (parent.type === ReleaseExecutionStepType.PROCESS_AGG_CI) {
				const ciDsps: Dsp[] = parent.metadata?.input?.dsps || [];

				const ciDealDsps = ciDsps.filter((dsp) => dsp.hasDeal);
				const state51Dsps = ciDsps.filter((dsp) => !dsp.hasDeal);

				const state51DspCodes = state51Dsps
					.map((dsp) => dsp.codeCi)
					.filter((code): code is string => !!code);

				const ciDealDspCodes = ciDealDsps
					.map((dsp) => dsp.codeCi)
					.filter((code): code is string => !!code);

				let order = 1;

				const commonTypes = [
					ReleaseExecutionStepType.CREATE_AND_UPLOAD_CI,
					ReleaseExecutionStepType.CREATE_FOLDER_DONE_CI,
					ReleaseExecutionStepType.WAIT_PARTNER_PROCESS,
					ReleaseExecutionStepType.VALIDATE_QA_CI,
				];

				for (const type of commonTypes) {
					childSteps.push({
						releaseExecutionId: executionId,
						parentStepId: parent.id,
						type,
						order: order++,
						...(type ===
						ReleaseExecutionStepType.WAIT_PARTNER_PROCESS
							? {
									metadata: {
										input: {
											waitMinutes: DEFAULT_WAIT_MINUTES,
										},
									},
								}
							: {}),
					});
				}

				if (state51Dsps.length > 0 || ciDealDsps.length > 0) {
					childSteps.push({
						releaseExecutionId: executionId,
						parentStepId: parent.id,
						type: ReleaseExecutionStepType.EXPORT_CI,
						order: order++,
						metadata: {
							input: {
								upc: snapshot?.upc,
								state51Dsps,
								state51DspCodes,
								ciDealDsps,
								ciDealDspCodes,
							},
						},
					});
				}

				childSteps.push({
					releaseExecutionId: executionId,
					parentStepId: parent.id,
					type: ReleaseExecutionStepType.WAIT_PARTNER_PROCESS,
					order: order++,
					metadata: {
						input: {
							waitMinutes: 1440,
						},
					},
				});

				childSteps.push({
					releaseExecutionId: executionId,
					parentStepId: parent.id,
					type: ReleaseExecutionStepType.SYNC_DATA_DSP_CI,
					order: order++,
				});
			}
		}

		return childSteps;
	}
}
