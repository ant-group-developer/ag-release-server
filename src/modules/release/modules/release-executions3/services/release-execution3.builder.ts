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
				// const { directDsps } = releaseExecution.metadata.input;
				// directDsps.forEach((dsp, index) => {
				// 	stepResult.push({
				// 		type: ReleaseExecutionStepType.PROCESS_DIRECT_CHILD,
				// 		order: index + 1,
				// 		metadata: { input: { dsp } },
				// 	});
				// });
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
				// const { ciDsps } = releaseExecution.metadata.input;
				// const ciDealDsps = ciDsps.filter((dsp) => dsp.hasDeal);
				// const state51Dsps = ciDsps.filter((dsp) => !dsp.hasDeal);

				// if (ciDealDsps.length > 0) {
				// 	stepResult.push({
				// 		type: ReleaseExecutionStepType.CI,
				// 		order: 1,
				// 		metadata: { input: { ciDealDsps } },
				// 	});
				// }

				// if (state51Dsps.length > 0) {
				// 	stepResult.push({
				// 		type: ReleaseExecutionStepType.STATE51,
				// 		order: 2,
				// 		metadata: { input: { state51Dsps } },
				// 	});
				// }
				break;

			case ReleaseExecutionStepType.CI:
				// const { upc } = releaseSnapshot;
				// const ciDspsInput = step.metadata?.input?.ciDealDsps ?? [];
				stepResult.push({
					type: ReleaseExecutionStepType.WAITING_ADMIN_EXPORT,
					order: 1,
					// metadata: { input: { upc, dsps: ciDspsInput } },
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

	// // ─── Public entry point ───────────────────────────────────────────────────

	// async buildPipeline(executionId: string): Promise<void> {
	// 	const execution = await this.executionRepo.findOne({
	// 		where: { id: executionId },
	// 	});

	// 	if (!execution) {
	// 		throw new Error('Execution not found');
	// 	}

	// 	await this.executionRepo.update(executionId, {
	// 		status: ReleaseExecutionStatus.PROCESSING,
	// 	});

	// 	const snapshot = execution.metadata?.input?.releaseSnapshot;
	// 	const dspCodes: string[] = execution.metadata?.input?.dspCodes || [];

	// 	const dsps = await this.fetchDsps(dspCodes);
	// 	const { directDsps, ciDsps } = this.partitionDsps(dsps);

	// 	const parentSteps = this.buildParentSteps(
	// 		executionId,
	// 		snapshot,
	// 		directDsps,
	// 		ciDsps,
	// 	);

	// 	const savedParents = await this.stepRepo.save(
	// 		parentSteps.map((step) => this.stepRepo.create(step)),
	// 	);

	// 	const childSteps = this.buildAllChildSteps(
	// 		executionId,
	// 		savedParents,
	// 		snapshot,
	// 	);

	// 	if (childSteps.length > 0) {
	// 		await this.stepRepo.save(
	// 			childSteps.map((step) => this.stepRepo.create(step)),
	// 		);
	// 	}
	// }

	// // ─── DSP helpers ─────────────────────────────────────────────────────────

	// private async fetchDsps(dspCodes: string[]): Promise<Dsp[]> {
	// 	if (dspCodes.length === 0) return [];

	// 	return this.manager.find(Dsp, {
	// 		where: { code: In(dspCodes) },
	// 		relations: ['dspRoutingConfig', 'dspRoutingConfig.aggregator'],
	// 	});
	// }

	// private partitionDsps(dsps: Dsp[]): {
	// 	directDsps: Dsp[];
	// 	ciDsps: Dsp[];
	// } {
	// 	const directDsps: Dsp[] = [];
	// 	const ciDsps: Dsp[] = [];

	// 	for (const dsp of dsps) {
	// 		const config = dsp.dspRoutingConfig;
	// 		const isCI =
	// 			config?.mode === RoutingModeEnum.AGGREGATOR &&
	// 			config.aggregator?.code === 'CI';

	// 		if (isCI) {
	// 			ciDsps.push(dsp);
	// 		} else {
	// 			directDsps.push(dsp);
	// 		}
	// 	}

	// 	return { directDsps, ciDsps };
	// }

	// // ─── Parent step builders ─────────────────────────────────────────────────

	// private buildParentSteps(
	// 	executionId: string,
	// 	snapshot: any,
	// 	directDsps: Dsp[],
	// 	ciDsps: Dsp[],
	// ): PartialStep[] {
	// 	const steps: PartialStep[] = [];
	// 	let order = 1;

	// 	if (!snapshot?.upc) {
	// 		steps.push({
	// 			releaseExecutionId: executionId,
	// 			type: ReleaseExecutionStepType.GEN_UPC,
	// 			order: order++,
	// 		});
	// 	}

	// 	const tracksWithoutIsrc: Track[] =
	// 		snapshot?.tracks?.filter((t: Track) => !t.isrc) || [];

	// 	if (tracksWithoutIsrc.length > 0) {
	// 		steps.push({
	// 			releaseExecutionId: executionId,
	// 			type: ReleaseExecutionStepType.GEN_ISRCS,
	// 			order: order++,
	// 			childExecutionMode: 'sequential',
	// 			metadata: {
	// 				input: {
	// 					trackIds: tracksWithoutIsrc.map((t: Track) => t.id),
	// 				},
	// 			},
	// 		});
	// 	}

	// 	steps.push({
	// 		releaseExecutionId: executionId,
	// 		type: ReleaseExecutionStepType.VALIDATE,
	// 		order: order++,
	// 	});

	// 	for (const dsp of directDsps) {
	// 		steps.push({
	// 			releaseExecutionId: executionId,
	// 			type: ReleaseExecutionStepType.PROCESS_DIRECT,
	// 			order: order++,
	// 			childExecutionMode: 'sequential',
	// 			metadata: { input: { dsps: [dsp] } },
	// 		});
	// 	}

	// 	if (ciDsps.length > 0) {
	// 		steps.push({
	// 			releaseExecutionId: executionId,
	// 			type: ReleaseExecutionStepType.PROCESS_AGG_CI,
	// 			order: order++,
	// 			childExecutionMode: 'sequential',
	// 			metadata: { input: { dsps: ciDsps } },
	// 		});
	// 	}

	// 	return steps;
	// }

	// // ─── Child step builders ──────────────────────────────────────────────────

	// private buildAllChildSteps(
	// 	executionId: string,
	// 	parents: ReleaseExecutionStep3[],
	// 	snapshot: any,
	// ): PartialStep[] {
	// 	const childSteps: PartialStep[] = [];

	// 	for (const parent of parents) {
	// 		switch (parent.type) {
	// 			case ReleaseExecutionStepType.GEN_ISRCS:
	// 				childSteps.push(
	// 					...this.buildIsrcChildSteps(executionId, parent),
	// 				);
	// 				break;

	// 			case ReleaseExecutionStepType.PROCESS_DIRECT:
	// 				childSteps.push(
	// 					...this.buildDirectChildSteps(executionId, parent),
	// 				);
	// 				break;

	// 			case ReleaseExecutionStepType.PROCESS_AGG_CI:
	// 				childSteps.push(
	// 					...this.buildCiChildSteps(
	// 						executionId,
	// 						parent,
	// 						snapshot,
	// 					),
	// 				);
	// 				break;
	// 		}
	// 	}

	// 	return childSteps;
	// }

	// private buildIsrcChildSteps(
	// 	executionId: string,
	// 	parent: ReleaseExecutionStep3,
	// ): PartialStep[] {
	// 	const trackIds: string[] = parent.metadata?.input?.trackIds || [];

	// 	return trackIds.map((trackId, index) => ({
	// 		releaseExecutionId: executionId,
	// 		parentStepId: parent.id,
	// 		type: ReleaseExecutionStepType.GEN_ISRC,
	// 		order: index + 1,
	// 		metadata: { input: { trackId } },
	// 	}));
	// }

	// private buildDirectChildSteps(
	// 	executionId: string,
	// 	parent: ReleaseExecutionStep3,
	// ): PartialStep[] {
	// 	const types = [
	// 		ReleaseExecutionStepType.CREATE_AND_UPLOAD_DIRECT,
	// 		ReleaseExecutionStepType.WAIT_PARTNER_PROCESS,
	// 		ReleaseExecutionStepType.SYNC_DATA_FROM_DSP,
	// 	];

	// 	return types.map((type, index) => ({
	// 		releaseExecutionId: executionId,
	// 		parentStepId: parent.id,
	// 		type,
	// 		order: index + 1,
	// 		...(type === ReleaseExecutionStepType.WAIT_PARTNER_PROCESS && {
	// 			metadata: { input: { waitMinutes: DEFAULT_WAIT_MINUTES } },
	// 		}),
	// 	}));
	// }

	// private buildCiChildSteps(
	// 	executionId: string,
	// 	parent: ReleaseExecutionStep3,
	// 	snapshot: any,
	// ): PartialStep[] {
	// 	const steps: PartialStep[] = [];
	// 	let order = 1;

	// 	const parentCiDsps: Dsp[] = parent.metadata?.input?.dsps || [];
	// 	const upc = snapshot?.upc;

	// 	const ciDealDsps = parentCiDsps.filter((dsp) => dsp.hasDeal);
	// 	const state51Dsps = parentCiDsps.filter((dsp) => !dsp.hasDeal);

	// 	// Step 1–4: common CI processing steps
	// 	const commonTypes = [
	// 		ReleaseExecutionStepType.CREATE_AND_UPLOAD_CI,
	// 		ReleaseExecutionStepType.CREATE_FOLDER_DONE_CI,
	// 		ReleaseExecutionStepType.WAIT_PARTNER_PROCESS,
	// 		ReleaseExecutionStepType.VALIDATE_QA_CI,
	// 	];

	// 	for (const type of commonTypes) {
	// 		steps.push({
	// 			releaseExecutionId: executionId,
	// 			parentStepId: parent.id,
	// 			type,
	// 			order: order++,
	// 			...(type === ReleaseExecutionStepType.WAIT_PARTNER_PROCESS && {
	// 				metadata: { input: { waitMinutes: DEFAULT_WAIT_MINUTES } },
	// 			}),
	// 		});
	// 	}

	// 	// Step 5: export to CI/State51 DSPs (conditional)
	// 	if (state51Dsps.length > 0 || ciDealDsps.length > 0) {
	// 		steps.push({
	// 			releaseExecutionId: executionId,
	// 			parentStepId: parent.id,
	// 			type: ReleaseExecutionStepType.EXPORT_CI,
	// 			order: order++,
	// 			metadata: {
	// 				input: {
	// 					upc,
	// 					state51Dsps,
	// 					state51DspCodes: this.extractValidCodes(state51Dsps),
	// 					ciDealDsps,
	// 					ciDealDspCodes: this.extractValidCodes(ciDealDsps),
	// 				},
	// 			},
	// 		});
	// 	}

	// 	// Step 6: wait 24h for CI export to be processed by partner
	// 	steps.push({
	// 		releaseExecutionId: executionId,
	// 		parentStepId: parent.id,
	// 		type: ReleaseExecutionStepType.WAIT_PARTNER_PROCESS,
	// 		order: order++,
	// 		metadata: { input: { waitMinutes: WAIT_CI_EXPORT_MINUTES } },
	// 	});

	// 	// Step 7: sync back data from DSP
	// 	steps.push({
	// 		releaseExecutionId: executionId,
	// 		parentStepId: parent.id,
	// 		type: ReleaseExecutionStepType.SYNC_DATA_DSP_CI,
	// 		order: order++,
	// 	});

	// 	return steps;
	// }

	// // ─── Utils ────────────────────────────────────────────────────────────────

	// private extractValidCodes(dsps: Dsp[]): string[] {
	// 	return dsps
	// 		.map((dsp) => dsp.codeCi)
	// 		.filter((code): code is string => !!code);
	// }
}
