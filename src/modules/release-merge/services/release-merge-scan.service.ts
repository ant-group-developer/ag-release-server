import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { Release } from 'src/modules/release/entities/release.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { DataSource, In, Not, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import {
	ApplyReleaseMergeItemsDto,
	QueryReleaseMergeItemDto,
} from '../dto/release-merge.dto';
import { ReleaseMergeItem } from '../entities/release-merge-item.entity';
import { ReleaseMergeRun } from '../entities/release-merge-run.entity';
import {
	ReleaseMergeItemClassification,
	ReleaseMergeItemStatus,
	ReleaseMergeRunStatus,
	ReleaseMergeTrigger,
} from '../enum/release-merge.enum';
import { isRealIsrc, normalizeMergeIsrc } from '../release-merge.util';
import { ReleaseMergeService } from './release-merge.service';

interface DuplicateEndpointRow {
	normalized_isrc: string;
	release_id: string;
	release_imported: boolean;
}

@Injectable()
export class ReleaseMergeScanService {
	private readonly logger = new Logger(ReleaseMergeScanService.name);

	constructor(
		@InjectRepository(ReleaseMergeRun)
		private readonly runRepo: Repository<ReleaseMergeRun>,
		@InjectRepository(ReleaseMergeItem)
		private readonly itemRepo: Repository<ReleaseMergeItem>,
		private readonly dataSource: DataSource,
		private readonly mergeService: ReleaseMergeService,
	) {}

	async scanAll(requestedBy: string): Promise<ReleaseMergeRun> {
		const run = await this.runRepo.save(
			this.runRepo.create({
				trigger: ReleaseMergeTrigger.FULL_SCAN,
				status: ReleaseMergeRunStatus.SCANNING,
				requestedBy,
			}),
		);

		try {
			const items = await this.discover(run.id);
			if (items.length) {
				await this.itemRepo.insert(
					items as unknown as QueryDeepPartialEntity<ReleaseMergeItem>[],
				);
			}
			const autoSafeCandidates = items.filter(
				(item) =>
					item.classification ===
					ReleaseMergeItemClassification.AUTO_SAFE,
			).length;
			return await this.runRepo.save({
				...run,
				status: ReleaseMergeRunStatus.READY,
				totalCandidates: items.length,
				autoSafeCandidates,
				manualCandidates: items.length - autoSafeCandidates,
				completedAt: new Date(),
			});
		} catch (error: any) {
			await this.runRepo.update(run.id, {
				status: ReleaseMergeRunStatus.FAILED,
				errorMessage: error.message,
				completedAt: new Date(),
			});
			throw error;
		}
	}

	async listRuns(query: BaseQueryDto): Promise<PageDto<ReleaseMergeRun>> {
		const [items, totalItems] = await this.runRepo.findAndCount({
			order: { createdAt: 'DESC' },
			skip: query.skip,
			take: query.limit,
		});
		return new PageDto({
			items,
			metadata: {
				page: query.page,
				pageSize: query.pageSize,
				totalItems,
			},
		});
	}

	async getRun(runId: string): Promise<ReleaseMergeRun> {
		const run = await this.runRepo.findOne({ where: { id: runId } });
		if (!run) throw new NotFoundException(`Merge scan ${runId} not found`);
		return run;
	}

	async listItems(
		runId: string,
		query: QueryReleaseMergeItemDto,
	): Promise<PageDto<ReleaseMergeItem>> {
		await this.getRun(runId);
		const where = {
			runId,
			...(query.classification
				? { classification: query.classification }
				: {}),
			...(query.status ? { status: query.status } : {}),
			...(query.targetReleaseId
				? { targetReleaseId: query.targetReleaseId }
				: {}),
		};
		const [items, totalItems] = await this.itemRepo.findAndCount({
			where,
			order: { createdAt: 'ASC' },
			skip: query.skip,
			take: query.limit,
		});
		return new PageDto({
			items,
			metadata: {
				page: query.page,
				pageSize: query.pageSize,
				totalItems,
			},
		});
	}

	async getItem(runId: string, itemId: string): Promise<ReleaseMergeItem> {
		const item = await this.itemRepo.findOne({
			where: { id: itemId, runId },
		});
		if (!item)
			throw new NotFoundException(`Merge item ${itemId} not found`);
		return item;
	}

	async startApply(
		runId: string,
		dto: ApplyReleaseMergeItemsDto,
		userId: string,
	): Promise<{ runId: string; totalSelected: number }> {
		const run = await this.getRun(runId);
		if (run.status === ReleaseMergeRunStatus.APPLYING) {
			throw new BadRequestException('Merge scan is already applying');
		}
		const where: any = {
			runId,
			classification: dto.force
				? ReleaseMergeItemClassification.MANUAL_REVIEW
				: ReleaseMergeItemClassification.AUTO_SAFE,
			status: dto.force
				? dto.retryFailed
					? In([
							ReleaseMergeItemStatus.MANUAL_REVIEW,
							ReleaseMergeItemStatus.FAILED,
						])
					: ReleaseMergeItemStatus.MANUAL_REVIEW
				: dto.retryFailed
					? In([
							ReleaseMergeItemStatus.PENDING,
							ReleaseMergeItemStatus.FAILED,
						])
					: ReleaseMergeItemStatus.PENDING,
		};
		let items: ReleaseMergeItem[];
		if (dto.selectAll) {
			if (dto.excludeItemIds?.length)
				where.id = Not(In(dto.excludeItemIds));
			items = await this.itemRepo.find({
				where,
				order: { createdAt: 'ASC' },
			});
		} else {
			if (!dto.itemIds?.length)
				throw new BadRequestException(
					'itemIds is required when selectAll=false',
				);
			where.id = In(dto.itemIds);
			items = await this.itemRepo.find({
				where,
				order: { createdAt: 'ASC' },
			});
		}
		if (dto.force) {
			items = items.filter((item) => this.isForceEligibleItem(item));
		}
		if (!items.length)
			throw new BadRequestException(
				dto.force
					? dto.retryFailed
						? 'No force-eligible manual merge item is pending or failed'
						: 'No force-eligible manual merge item selected'
					: dto.retryFailed
						? 'No AUTO_SAFE merge item is pending or failed'
						: 'No AUTO_SAFE pending merge item selected',
			);

		await this.runRepo.update(runId, {
			status: ReleaseMergeRunStatus.APPLYING,
			errorMessage: null,
			completedAt: null,
		});
		void this.applyItems(runId, items, userId, dto.force).catch(
			async (error: any) => {
				this.logger.error(
					`Merge run ${runId} failed: ${error.message}`,
				);
				await this.runRepo.update(runId, {
					status: ReleaseMergeRunStatus.FAILED,
					errorMessage: error.message,
					completedAt: new Date(),
				});
			},
		);
		return { runId, totalSelected: items.length };
	}

	private isForceEligibleItem(item: ReleaseMergeItem): boolean {
		return (
			item.classification ===
				ReleaseMergeItemClassification.MANUAL_REVIEW &&
			(item.status === ReleaseMergeItemStatus.MANUAL_REVIEW ||
				item.status === ReleaseMergeItemStatus.FAILED) &&
			item.reasonCodes.length === 1 &&
			item.reasonCodes[0] === 'UPC_NOT_EQUIVALENT' &&
			item.sharedIsrcs.length > 0 &&
			item.sourceOnlyIsrcs.length === 0 &&
			item.targetOnlyIsrcs.length === 0
		);
	}

	private async applyItems(
		runId: string,
		items: ReleaseMergeItem[],
		userId: string,
		force = false,
	): Promise<void> {
		let failed = 0;
		for (const item of items) {
			if (!item.targetReleaseId) continue;
			await this.itemRepo.update(item.id, {
				status: ReleaseMergeItemStatus.APPLYING,
			});
			try {
				await this.mergeService.apply({
					sourceReleaseId: item.sourceReleaseId,
					targetReleaseId: item.targetReleaseId,
					mergeItemId: item.id,
					userId,
					force,
				});
			} catch (error: any) {
				failed++;
				this.logger.warn(
					`Merge item ${item.id} failed: ${error.message}`,
				);
				await this.itemRepo.update(item.id, {
					status: ReleaseMergeItemStatus.FAILED,
					errorMessage: error.message,
				});
			}
		}

		const appliedCandidates = await this.itemRepo.count({
			where: { runId, status: ReleaseMergeItemStatus.APPLIED },
		});
		const failedCandidates = await this.itemRepo.count({
			where: { runId, status: ReleaseMergeItemStatus.FAILED },
		});
		const remaining = await this.itemRepo.count({
			where: {
				runId,
				classification: ReleaseMergeItemClassification.AUTO_SAFE,
				status: ReleaseMergeItemStatus.PENDING,
			},
		});
		await this.runRepo.update(runId, {
			status:
				failedCandidates > 0 || remaining > 0
					? ReleaseMergeRunStatus.PARTIALLY_APPLIED
					: ReleaseMergeRunStatus.APPLIED,
			appliedCandidates,
			failedCandidates,
			completedAt: new Date(),
		});
	}

	private async discover(runId: string): Promise<ReleaseMergeItem[]> {
		const endpoints: DuplicateEndpointRow[] = await this.dataSource.query(`
			WITH normalized_tracks AS (
				SELECT t.release_id,
				       upper(regexp_replace(btrim(t.isrc), '[-[:space:]]', '', 'g')) AS normalized_isrc,
				       r.is_imported_from_report AS release_imported
				FROM tracks t
				JOIN releases r ON r.id = t.release_id
				WHERE t.isrc IS NOT NULL
				  AND btrim(t.isrc) <> ''
				  AND upper(regexp_replace(btrim(t.isrc), '[-[:space:]]', '', 'g')) ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'
			), duplicate_keys AS (
				SELECT normalized_isrc
				FROM normalized_tracks
				GROUP BY normalized_isrc
				HAVING COUNT(DISTINCT release_id) > 1
			)
			SELECT DISTINCT n.normalized_isrc, n.release_id, n.release_imported
			FROM normalized_tracks n
			JOIN duplicate_keys d USING (normalized_isrc)
			ORDER BY n.normalized_isrc, n.release_id
		`);

		const endpointsByIsrc = new Map<string, DuplicateEndpointRow[]>();
		for (const endpoint of endpoints) {
			const group = endpointsByIsrc.get(endpoint.normalized_isrc) ?? [];
			group.push(endpoint);
			endpointsByIsrc.set(endpoint.normalized_isrc, group);
		}

		const candidateTargetsBySource = new Map<string, Set<string>>();
		const allCandidateSourceIds = new Set<string>();
		for (const group of endpointsByIsrc.values()) {
			const imported = group.filter((row) => row.release_imported);
			const canonical = group.filter((row) => !row.release_imported);
			if (imported.length) {
				for (const source of imported) {
					allCandidateSourceIds.add(source.release_id);
					const targets =
						candidateTargetsBySource.get(source.release_id) ??
						new Set<string>();
					for (const target of canonical)
						targets.add(target.release_id);
					candidateTargetsBySource.set(source.release_id, targets);
				}
			} else if (canonical.length > 1) {
				for (const source of canonical) {
					allCandidateSourceIds.add(source.release_id);
					candidateTargetsBySource.set(
						source.release_id,
						new Set(
							canonical
								.filter(
									(row) =>
										row.release_id !== source.release_id,
								)
								.map((row) => row.release_id),
						),
					);
				}
			}
		}

		const allReleaseIds = new Set<string>(allCandidateSourceIds);
		for (const targets of candidateTargetsBySource.values()) {
			for (const target of targets) allReleaseIds.add(target);
		}
		if (!allReleaseIds.size) return [];
		const [releases, tracks] = await Promise.all([
			this.dataSource
				.getRepository(Release)
				.find({ where: { id: In([...allReleaseIds]) } }),
			this.dataSource
				.getRepository(Track)
				.find({ where: { releaseId: In([...allReleaseIds]) } }),
		]);
		const releaseById = new Map(
			releases.map((release) => [release.id, release]),
		);

		const result: ReleaseMergeItem[] = [];
		for (const sourceId of allCandidateSourceIds) {
			const source = releaseById.get(sourceId);
			if (!source) continue;
			const candidateTargetIds = [
				...(candidateTargetsBySource.get(sourceId) ?? []),
			];
			const sourceTracks = tracks.filter(
				(track) => track.releaseId === sourceId,
			);
			const sourceIsrcs = [
				...new Set(
					sourceTracks
						.filter((track) => isRealIsrc(track.isrc))
						.map((track) => normalizeMergeIsrc(track.isrc)),
				),
			];
			let classification = ReleaseMergeItemClassification.MANUAL_REVIEW;
			let status = ReleaseMergeItemStatus.MANUAL_REVIEW;
			let reasonCodes: string[] = [];
			let targetReleaseId: string | null = null;
			let sharedIsrcs: string[] = [];
			let sourceOnlyIsrcs = sourceIsrcs;
			let targetOnlyIsrcs: string[] = [];
			let targetTrackCount = 0;
			let upcEquivalent = false;

			if (candidateTargetIds.length === 1) {
				targetReleaseId = candidateTargetIds[0];
				const target = releaseById.get(targetReleaseId);
				if (target) {
					const plan = this.mergeService.buildPairPlan(
						source,
						target,
						tracks.filter(
							(track) =>
								track.releaseId === source.id ||
								track.releaseId === target.id,
						),
					);
					sharedIsrcs = plan.sharedIsrcs;
					sourceOnlyIsrcs = plan.sourceOnlyIsrcs;
					targetOnlyIsrcs = plan.targetOnlyIsrcs;
					targetTrackCount = plan.targetTrackCount;
					upcEquivalent = plan.upcEquivalent;
					reasonCodes = plan.reasonCodes;
					if (plan.autoSafe) {
						classification =
							ReleaseMergeItemClassification.AUTO_SAFE;
						status = ReleaseMergeItemStatus.PENDING;
					}
				}
			} else {
				reasonCodes = [
					candidateTargetIds.length
						? 'SOURCE_MULTI_TARGET'
						: 'NO_CANONICAL_TARGET',
				];
				if (!source.isImportedFromReport)
					reasonCodes.push('CANONICAL_TO_CANONICAL');
			}

			result.push(
				this.itemRepo.create({
					runId,
					sourceReleaseId: sourceId,
					targetReleaseId,
					candidateTargetReleaseIds: candidateTargetIds,
					classification,
					status,
					reasonCodes,
					sharedIsrcs,
					sourceOnlyIsrcs,
					targetOnlyIsrcs,
					sourceTrackCount: sourceTracks.length,
					targetTrackCount,
					upcEquivalent,
					snapshot: {
						sourceUpdatedAt: source.updatedAt,
						targetUpdatedAt: targetReleaseId
							? releaseById.get(targetReleaseId)?.updatedAt
							: null,
					},
				}),
			);
		}
		return result;
	}
}
