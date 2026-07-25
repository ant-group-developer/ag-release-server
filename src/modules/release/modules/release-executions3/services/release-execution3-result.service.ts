import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { ReleaseDspStatus } from 'src/modules/release/enum/release-dsp.enum';
import { ReleaseDspDeliveryService } from 'src/modules/release/services/release-dsp-services/release-dsp-delivery.service';
import { In, Repository } from 'typeorm';
import { ReleaseExecutionResultDto } from '../dtos/release-execution3.dto';
import { ReleaseExecutionResult3 } from '../entites/release-execution3-result.entity';

type ResolvedReleaseExecutionResult3Item = {
	dspId: string;
	status: ReleaseDspStatus;
};

const RELEASE_DSP_STATUS_PRIORITY: Record<ReleaseDspStatus, number> = {
	[ReleaseDspStatus.DISTRIBUTED]: 1,
	[ReleaseDspStatus.TAKEN_DOWN]: 1,
	[ReleaseDspStatus.ISSUES]: 1,
	[ReleaseDspStatus.PROCESSING]: 2,
	[ReleaseDspStatus.NEVER_DISTRIBUTED]: 3,
	[ReleaseDspStatus.DRAFT]: 4,
};

@Injectable()
export class ReleaseExecution3ResultService {
	constructor(
		@InjectRepository(ReleaseExecutionResult3)
		private readonly repo: Repository<ReleaseExecutionResult3>,

		@InjectRepository(Dsp)
		private readonly dspRepo: Repository<Dsp>,

		private readonly moduleRef: ModuleRef,
	) {}

	async updateExecutionOutputResult(input: {
		releaseExecutionId: string;
		releaseExecutionStepId?: string | null;
		releaseId?: string | null;
		results: ReleaseExecutionResultDto[];
		isOverrideStatus?: boolean;
	}): Promise<void> {
		await this.upsertResults(input);
		await this.syncToReleaseDspDelivery(input.releaseExecutionId);
	}

	private async upsertResults(input: {
		releaseExecutionId: string;
		releaseExecutionStepId?: string | null;
		releaseId?: string | null;
		results: ReleaseExecutionResultDto[];
		isOverrideStatus?: boolean;
	}): Promise<ReleaseExecutionResult3[]> {
		if (!input.results.length) return [];

		// Resolve input ve dang table can luu: dspId + status.
		// Caller truyen dspId thi dung luon, truyen dspCode thi service map sang dspId.
		const resolvedResults = await this.resolveResultItems(input.results);
		if (!resolvedResults.length) return [];

		// Giu result co priority cao nhat theo tung DSP trong cung mot lan goi.
		const highestByDspId = new Map<
			string,
			ResolvedReleaseExecutionResult3Item
		>();

		for (const result of resolvedResults) {
			const current = highestByDspId.get(result.dspId);
			if (!current || this.hasHigherPriority(result, current)) {
				highestByDspId.set(result.dspId, result);
			}
		}

		const existingResults = await this.repo.find({
			where: {
				releaseExecutionId: input.releaseExecutionId,
				dspId: In([...highestByDspId.keys()]),
			},
		});
		const existingByDspId = new Map(
			existingResults.map((result) => [result.dspId, result]),
		);

		const upsertableResults = [...highestByDspId.values()].filter(
			(result) => {
				const existing = existingByDspId.get(result.dspId);

				if (
					!input.releaseExecutionStepId &&
					result.status === ReleaseDspStatus.DISTRIBUTED &&
					existing?.status === ReleaseDspStatus.PROCESSING
				) {
					return false;
				}

				return (
					!existing ||
					input.isOverrideStatus ||
					this.hasHigherPriority(result, existing)
				);
			},
		);

		if (!upsertableResults.length) return existingResults;

		// Bang nay la latest-state: unique theo releaseExecutionId + dspId.
		const values = upsertableResults.map((result) =>
			this.repo.create({
				releaseExecutionId: input.releaseExecutionId,
				releaseExecutionStepId: input.releaseExecutionStepId ?? null,
				releaseId: input.releaseId ?? null,
				dspId: result.dspId,
				status: result.status,
				updatedAt: new Date(),
			}),
		);

		// Upsert de moi execution chi co mot latest result cho moi DSP.
		await this.repo
			.createQueryBuilder()
			.insert()
			.into(ReleaseExecutionResult3)
			.values(values)
			.orUpdate(
				[
					'release_execution_step_id',
					'release_id',
					'status',
					'updated_at',
				],
				['release_execution_id', 'dsp_id'],
			)
			.execute();

		return this.repo.find({
			where: {
				releaseExecutionId: input.releaseExecutionId,
				dspId: In(values.map((value) => value.dspId)),
			},
		});
	}

	async syncToReleaseDspDelivery(
		releaseExecutionId: string,
	): Promise<boolean> {
		const results = await this.repo.find({
			where: { releaseExecutionId },
			relations: ['dsp', 'releaseExecution'],
			order: { updatedAt: 'DESC' },
		});

		const releaseId =
			results[0].releaseId ?? results[0].releaseExecution.releaseId;
		if (!releaseId) return false;

		const releaseDspDeliveryService = this.moduleRef.get(
			ReleaseDspDeliveryService,
			{ strict: false },
		);

		await releaseDspDeliveryService.updateDeliveryStatus({
			releaseIds: [releaseId],
			items: results.map((result) => ({
				dspId: result.dspId,
				dspCode: result.dsp.code,
				status: result.status,
			})),
		});

		return true;
	}

	private async resolveResultItems(
		items: ReleaseExecutionResultDto[],
	): Promise<ResolvedReleaseExecutionResult3Item[]> {
		const dspCodes = [
			...new Set(
				items
					.filter((item) => !item.dspId && item.dspCode)
					.map((item) => item.dspCode),
			),
		];

		const dspCodeToId = new Map<string, string>();
		if (dspCodes.length) {
			const dsps = await this.dspRepo.find({
				where: { code: In(dspCodes) },
				select: ['id', 'code'],
			});

			for (const dsp of dsps) {
				dspCodeToId.set(dsp.code, dsp.id);
			}
		}

		return items
			.map((item) => {
				const dspId =
					item.dspId ??
					(item.dspCode ? dspCodeToId.get(item.dspCode) : undefined);

				return {
					dspId,
					status: item.status,
				};
			})
			.filter(
				(item): item is ResolvedReleaseExecutionResult3Item =>
					!!item.dspId,
			);
	}

	private hasHigherPriority(
		incoming: Pick<ReleaseExecutionResult3, 'status'>,
		current: Pick<ReleaseExecutionResult3, 'status'>,
	): boolean {
		return (
			RELEASE_DSP_STATUS_PRIORITY[incoming.status] <
			RELEASE_DSP_STATUS_PRIORITY[current.status]
		);
	}
}
