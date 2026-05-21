import { Injectable } from '@nestjs/common';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { DEFAULT_WAIT_MINUTES } from 'src/common/constants/common.default.constants';
import { RoutingModeEnum } from 'src/modules/distribution/dsp-routing/enum/dsp-routing.enum';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { EntityManager, In, Repository } from 'typeorm';
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

	// ─── Public entry point ───────────────────────────────────────────────────

	async buildPipeline(executionId: string): Promise<void> {
		const execution = await this.executionRepo.findOne({
			where: { id: executionId },
		});

		if (!execution) {
			throw new Error('Execution not found');
		}

		await this.executionRepo.update(executionId, {
			status: ReleaseExecutionStatus.PROCESSING,
		});

		const snapshot = execution.metadata?.input?.releaseSnapshot;
		const dspCodes: string[] = execution.metadata?.input?.dspCodes || [];

		const dsps = await this.fetchDsps(dspCodes);
		const { directDsps, ciDsps } = this.partitionDsps(dsps);

		const parentSteps = this.buildParentSteps(
			executionId,
			snapshot,
			directDsps,
			ciDsps,
		);

		const savedParents = await this.stepRepo.save(
			parentSteps.map((step) => this.stepRepo.create(step)),
		);

		const childSteps = this.buildAllChildSteps(
			executionId,
			savedParents,
			snapshot,
		);

		if (childSteps.length > 0) {
			await this.stepRepo.save(
				childSteps.map((step) => this.stepRepo.create(step)),
			);
		}
	}

	// ─── DSP helpers ─────────────────────────────────────────────────────────

	private async fetchDsps(dspCodes: string[]): Promise<Dsp[]> {
		if (dspCodes.length === 0) return [];

		return this.manager.find(Dsp, {
			where: { code: In(dspCodes) },
			relations: ['dspRoutingConfig', 'dspRoutingConfig.aggregator'],
		});
	}

	private partitionDsps(dsps: Dsp[]): {
		directDsps: Dsp[];
		ciDsps: Dsp[];
	} {
		const directDsps: Dsp[] = [];
		const ciDsps: Dsp[] = [];

		for (const dsp of dsps) {
			const config = dsp.dspRoutingConfig;
			const isCI =
				config?.mode === RoutingModeEnum.AGGREGATOR &&
				config.aggregator?.code === 'CI';

			if (isCI) {
				ciDsps.push(dsp);
			} else {
				directDsps.push(dsp);
			}
		}

		return { directDsps, ciDsps };
	}

	// ─── Parent step builders ─────────────────────────────────────────────────

	private buildParentSteps(
		executionId: string,
		snapshot: any,
		directDsps: Dsp[],
		ciDsps: Dsp[],
	): PartialStep[] {
		const steps: PartialStep[] = [];
		let order = 1;

		if (!snapshot?.upc) {
			steps.push({
				releaseExecutionId: executionId,
				type: ReleaseExecutionStepType.GEN_UPC,
				order: order++,
			});
		}

		const tracksWithoutIsrc: Track[] =
			snapshot?.tracks?.filter((t: Track) => !t.isrc) || [];

		if (tracksWithoutIsrc.length > 0) {
			steps.push({
				releaseExecutionId: executionId,
				type: ReleaseExecutionStepType.GEN_ISRCS,
				order: order++,
				childExecutionMode: 'sequential',
				metadata: {
					input: {
						trackIds: tracksWithoutIsrc.map((t: Track) => t.id),
					},
				},
			});
		}

		steps.push({
			releaseExecutionId: executionId,
			type: ReleaseExecutionStepType.VALIDATE,
			order: order++,
		});

		for (const dsp of directDsps) {
			steps.push({
				releaseExecutionId: executionId,
				type: ReleaseExecutionStepType.PROCESS_DIRECT,
				order: order++,
				childExecutionMode: 'sequential',
				metadata: { input: { dsps: [dsp] } },
			});
		}

		if (ciDsps.length > 0) {
			steps.push({
				releaseExecutionId: executionId,
				type: ReleaseExecutionStepType.PROCESS_AGG_CI,
				order: order++,
				childExecutionMode: 'sequential',
				metadata: { input: { dsps: ciDsps } },
			});
		}

		return steps;
	}

	// ─── Child step builders ──────────────────────────────────────────────────

	private buildAllChildSteps(
		executionId: string,
		parents: ReleaseExecutionStep3[],
		snapshot: any,
	): PartialStep[] {
		const childSteps: PartialStep[] = [];

		for (const parent of parents) {
			switch (parent.type) {
				case ReleaseExecutionStepType.GEN_ISRCS:
					childSteps.push(
						...this.buildIsrcChildSteps(executionId, parent),
					);
					break;

				case ReleaseExecutionStepType.PROCESS_DIRECT:
					childSteps.push(
						...this.buildDirectChildSteps(executionId, parent),
					);
					break;

				case ReleaseExecutionStepType.PROCESS_AGG_CI:
					childSteps.push(
						...this.buildCiChildSteps(
							executionId,
							parent,
							snapshot,
						),
					);
					break;
			}
		}

		return childSteps;
	}

	private buildIsrcChildSteps(
		executionId: string,
		parent: ReleaseExecutionStep3,
	): PartialStep[] {
		const trackIds: string[] = parent.metadata?.input?.trackIds || [];

		return trackIds.map((trackId, index) => ({
			releaseExecutionId: executionId,
			parentStepId: parent.id,
			type: ReleaseExecutionStepType.GEN_ISRC,
			order: index + 1,
			metadata: { input: { trackId } },
		}));
	}

	private buildDirectChildSteps(
		executionId: string,
		parent: ReleaseExecutionStep3,
	): PartialStep[] {
		const types = [
			ReleaseExecutionStepType.CREATE_AND_UPLOAD_DIRECT,
			ReleaseExecutionStepType.WAIT_PARTNER_PROCESS,
			ReleaseExecutionStepType.SYNC_DATA_FROM_DSP,
		];

		return types.map((type, index) => ({
			releaseExecutionId: executionId,
			parentStepId: parent.id,
			type,
			order: index + 1,
			...(type === ReleaseExecutionStepType.WAIT_PARTNER_PROCESS && {
				metadata: { input: { waitMinutes: DEFAULT_WAIT_MINUTES } },
			}),
		}));
	}

	private buildCiChildSteps(
		executionId: string,
		parent: ReleaseExecutionStep3,
		snapshot: any,
	): PartialStep[] {
		const steps: PartialStep[] = [];
		let order = 1;

		const parentCiDsps: Dsp[] = parent.metadata?.input?.dsps || [];
		const upc = snapshot?.upc;

		const ciDealDsps = parentCiDsps.filter((dsp) => dsp.hasDeal);
		const state51Dsps = parentCiDsps.filter((dsp) => !dsp.hasDeal);

		// Step 1–4: common CI processing steps
		const commonTypes = [
			ReleaseExecutionStepType.CREATE_AND_UPLOAD_CI,
			ReleaseExecutionStepType.CREATE_FOLDER_DONE_CI,
			ReleaseExecutionStepType.WAIT_PARTNER_PROCESS,
			ReleaseExecutionStepType.VALIDATE_QA_CI,
		];

		for (const type of commonTypes) {
			steps.push({
				releaseExecutionId: executionId,
				parentStepId: parent.id,
				type,
				order: order++,
				...(type === ReleaseExecutionStepType.WAIT_PARTNER_PROCESS && {
					metadata: { input: { waitMinutes: DEFAULT_WAIT_MINUTES } },
				}),
			});
		}

		// Step 5: export to CI/State51 DSPs (conditional)
		if (state51Dsps.length > 0 || ciDealDsps.length > 0) {
			steps.push({
				releaseExecutionId: executionId,
				parentStepId: parent.id,
				type: ReleaseExecutionStepType.EXPORT_CI,
				order: order++,
				metadata: {
					input: {
						upc,
						state51Dsps,
						state51DspCodes: this.extractValidCodes(state51Dsps),
						ciDealDsps,
						ciDealDspCodes: this.extractValidCodes(ciDealDsps),
					},
				},
			});
		}

		// Step 6: wait 24h for CI export to be processed by partner
		steps.push({
			releaseExecutionId: executionId,
			parentStepId: parent.id,
			type: ReleaseExecutionStepType.WAIT_PARTNER_PROCESS,
			order: order++,
			metadata: { input: { waitMinutes: WAIT_CI_EXPORT_MINUTES } },
		});

		// Step 7: sync back data from DSP
		steps.push({
			releaseExecutionId: executionId,
			parentStepId: parent.id,
			type: ReleaseExecutionStepType.SYNC_DATA_DSP_CI,
			order: order++,
		});

		return steps;
	}

	// ─── Utils ────────────────────────────────────────────────────────────────

	private extractValidCodes(dsps: Dsp[]): string[] {
		return dsps
			.map((dsp) => dsp.codeCi)
			.filter((code): code is string => !!code);
	}
}
