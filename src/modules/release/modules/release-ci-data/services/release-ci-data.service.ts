import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { CiExportService } from 'src/modules/partners-api/ci/services/ci-export.service';
import { CiImportService } from 'src/modules/partners-api/ci/services/ci-import.service';
import { Release } from 'src/modules/release/entities/release.entity';
import { ReleaseStatus } from 'src/modules/release/enum/release.enum';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
	BulkSyncDataCiDto,
	GetListReleaseCiDataDto,
	UpsertReleaseCiDataDto,
} from '../dto/release-ci-data.dto';
import {
	ReleaseCiData,
	ReleaseCiDataStatus,
} from '../entities/release-ci-data.entity';

@Injectable()
export class ReleaseCiDataService {
	private readonly logger = new Logger(ReleaseCiDataService.name);

	constructor(
		@InjectRepository(ReleaseCiData)
		private readonly repo: Repository<ReleaseCiData>,

		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		private readonly ciImportService: CiImportService,
		private readonly ciExportService: CiExportService,
	) {}

	async upsertByReleaseId(releaseId: string, data: UpsertReleaseCiDataDto) {
		if (data.importRawData !== undefined) {
			data.importParsedData = this.getLatestImportRecord(
				data.importRawData,
			);
		}

		const entity = await this.repo.findOne({ where: { releaseId } });

		if (!entity) {
			const created = this.repo.create({
				releaseId,
				...data,
			});

			return this.repo.save(created);
		}

		Object.assign(entity, data);

		entity.latestSyncedAt = new Date();
		await this.repo.save(entity);

		return this.findByReleaseId(releaseId);
	}

	async findByReleaseId(releaseId: string) {
		const entity = await this.repo.findOne({
			where: { releaseId },
			relations: { release: true },
		});

		if (!entity) {
			throw new NotFoundException('Release CI data not found');
		}

		return entity;
	}

	async findOne(id: string) {
		const entity = await this.repo.findOne({
			where: { id },
			relations: { release: true },
		});

		if (!entity) {
			throw new NotFoundException('Release CI data not found');
		}

		return entity;
	}

	async getList(filter: GetListReleaseCiDataDto) {
		const { page, pageSize } = filter;
		const qb = this.createQbGetList(filter);
		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: { page, pageSize, totalItems },
		});
	}

	async createMissingForNonImportedNonDraftReleases() {
		const batchSize = 100;
		let totalEligible = 0;
		let created = 0;
		const releaseIds: string[] = [];

		while (true) {
			const releases = await this.releaseRepo
				.createQueryBuilder('release')
				.leftJoin('release.ciData', 'releaseCiData')
				.select(['release.id', 'release.createdAt'])
				.where('release.isImportedFromReport = :isImportedFromReport', {
					isImportedFromReport: false,
				})
				.andWhere('release.status != :draftStatus', {
					draftStatus: ReleaseStatus.DRAFT,
				})
				.andWhere('releaseCiData.id IS NULL')
				.orderBy('release.createdAt', 'ASC')
				.take(batchSize)
				.getMany();

			if (!releases.length) break;

			const batchReleaseIds = releases.map((release) => release.id);
			totalEligible += batchReleaseIds.length;
			releaseIds.push(...batchReleaseIds);

			const result = await this.repo
				.createQueryBuilder()
				.insert()
				.into(ReleaseCiData)
				.values(
					batchReleaseIds.map((releaseId) => ({
						releaseId,
						status: ReleaseCiDataStatus.NOT_FOUND_ON_CI,
					})),
				)
				.orIgnore()
				.execute();

			created += result.identifiers.length;

			if (!result.identifiers.length) {
				break;
			}
		}

		return {
			totalEligible,
			created,
			releaseIds,
		};
	}

	async syncCiDataByReleaseId(releaseId: string) {
		const release = await this.releaseRepo.findOne({
			where: { id: releaseId },
			select: {
				id: true,
				upc: true,
				releaseFormatsIdCi: true,
			},
		});

		if (!release) {
			throw new NotFoundException('Release not found');
		}

		if (!release.upc) {
			throw new BadRequestException('Release UPC is missing');
		}

		if (!release.releaseFormatsIdCi) {
			throw new BadRequestException('Release CI format ID is missing');
		}

		const [importRawData, exportRawData] = await Promise.all([
			this.ciImportService.getImports({
				package_id: release.upc,
				page_size: 999,
			}),
			this.ciExportService.getDeliverDesire({
				release_id: release.releaseFormatsIdCi,
				pageSize: 999,
			}),
		]);

		return this.upsertByReleaseId(release.id, {
			status: ReleaseCiDataStatus.EXISTS_ON_CI,
			importRawData,
			exportRawData,
		});
	}

	async syncCiDataById(id: string) {
		const ciData = await this.repo.findOne({
			where: { id },
			select: {
				id: true,
				releaseId: true,
			},
		});

		if (!ciData) {
			throw new NotFoundException('Release CI data not found');
		}

		return this.syncCiDataByReleaseId(ciData.releaseId);
	}

	// có thể truyền vào release ids sẽ parse ra mảng ids, merge với ids truyền vào
	async bulkSyncDataCi(filter?: BulkSyncDataCiDto) {
		const batchSize = 5;
		const targetIds = new Set(filter?.ids ?? []);

		// FE can pass release IDs or release_ci_data IDs. Convert release IDs to
		// release_ci_data IDs first, then merge both inputs into one target set.
		if (filter?.releaseIds?.length) {
			const ciDataItems = await this.repo
				.createQueryBuilder('releaseCiData')
				.select(['releaseCiData.id'])
				.where('releaseCiData.releaseId IN (:...releaseIds)', {
					releaseIds: filter.releaseIds,
				})
				.getMany();

			ciDataItems.forEach((item) => targetIds.add(item.id));
		}

		const qb = this.repo
			.createQueryBuilder('releaseCiData')
			.select(['releaseCiData.id', 'releaseCiData.releaseId'])
			.orderBy('releaseCiData.createdAt', 'ASC');

		// When specific IDs are provided, sync only those records. Otherwise,
		// fall back to the optional latestSyncedAt filter, or all records.
		if (targetIds.size) {
			qb.where('releaseCiData.id IN (:...ids)', {
				ids: Array.from(targetIds),
			});
		}

		if (filter?.latestSyncedAt !== undefined) {
			if (filter.latestSyncedAt === null) {
				qb.andWhere('releaseCiData.latestSyncedAt IS NULL');
			}
		}

		const pendingItems = await qb.getMany();
		let synced = 0;
		const failed: { id: string; releaseId: string; message: string }[] = [];
		const totalBatches = Math.ceil(pendingItems.length / batchSize);

		this.logger.log(
			`Starting bulk sync data CI. Total pending: ${pendingItems.length}, batch size: ${batchSize}`,
		);

		for (let index = 0; index < pendingItems.length; index += batchSize) {
			const batch = pendingItems.slice(index, index + batchSize);
			const batchNumber = Math.floor(index / batchSize) + 1;
			const ids = batch.map((item) => item.id);

			this.logger.log(
				`Processing bulk sync data CI batch ${batchNumber}/${totalBatches}. IDs: ${ids.join(', ')}`,
			);

			const results = await Promise.allSettled(
				batch.map((item) => this.syncCiDataById(item.id)),
			);

			results.forEach((result, resultIndex) => {
				const item = batch[resultIndex];

				if (result.status === 'fulfilled') {
					synced += 1;
					this.logger.log(
						`Bulk synced data CI ${item.id} for release ${item.releaseId}. Progress: ${
							synced + failed.length
						}/${pendingItems.length}`,
					);
					return;
				}

				const reason = result.reason;
				const message =
					reason instanceof Error ? reason.message : String(reason);

				failed.push({
					id: item.id,
					releaseId: item.releaseId,
					message,
				});
				this.logger.error(
					`Failed to bulk sync data CI ${item.id} for release ${item.releaseId}. Progress: ${
						synced + failed.length
					}/${pendingItems.length}. Error: ${message}`,
				);
			});

			this.logger.log(
				`Finished bulk sync data CI batch ${batchNumber}/${totalBatches}. Synced: ${synced}, failed: ${failed.length}`,
			);
		}

		this.logger.log(
			`Finished bulk sync data CI. Total: ${pendingItems.length}, synced: ${synced}, failed: ${failed.length}`,
		);

		return {
			total: pendingItems.length,
			batchSize,
			synced,
			failed: failed.length,
			errors: failed,
		};
	}

	private getLatestImportRecord(
		importRawData?: Record<string, any> | null,
	): Record<string, any> | null {
		if (!importRawData) {
			return null;
		}

		const items = this.getImportItems(importRawData);
		if (!items.length) {
			return null;
		}

		return items.sort((a, b) => {
			const aTime = new Date(a?.modify_time ?? 0).getTime();
			const bTime = new Date(b?.modify_time ?? 0).getTime();
			return bTime - aTime;
		})[0];
	}

	private getImportItems(
		importRawData: Record<string, any>,
	): Record<string, any>[] {
		if (Array.isArray(importRawData)) {
			return importRawData;
		}

		if (Array.isArray(importRawData._embedded)) {
			return importRawData._embedded;
		}

		if (Array.isArray(importRawData._embedded?.items)) {
			return importRawData._embedded.items;
		}

		if (Array.isArray(importRawData.items)) {
			return importRawData.items;
		}

		return [importRawData];
	}

	private createQbGetList(filter: GetListReleaseCiDataDto) {
		const qb = this.repo.createQueryBuilder('releaseCiData');
		qb.leftJoinAndSelect('releaseCiData.release', 'release');
		this.applyFilter({ qb, filter });
		return qb;
	}

	private applyFilter({
		qb,
		filter,
	}: {
		qb: SelectQueryBuilder<ReleaseCiData>;
		filter: GetListReleaseCiDataDto;
	}) {
		const { releaseId, status, keyword } = filter;

		if (releaseId) {
			qb.andWhere('releaseCiData.releaseId = :releaseId', { releaseId });
		}

		if (status) {
			qb.andWhere('releaseCiData.status = :status', { status });
		}

		if (keyword?.length) {
			const keywords = keyword.map((k) => `%${k}%`);

			qb.andWhere(
				`(
					"releaseCiData"."status"::text ILIKE ANY(:keywords)
					OR release.title ILIKE ANY(:keywords)
					OR release.upc ILIKE ANY(:keywords)
				)`,
				{ keywords },
			);
		}

		orderAndPaging2({ qb, filter });
	}
}
