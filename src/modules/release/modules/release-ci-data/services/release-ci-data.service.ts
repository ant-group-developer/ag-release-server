import {
	BadRequestException,
	Inject,
	Injectable,
	Logger,
	NotFoundException,
	forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { CiExportService } from 'src/modules/partners-api/ci/services/ci-export.service';
import { CiImportService } from 'src/modules/partners-api/ci/services/ci-import.service';
import { Release } from 'src/modules/release/entities/release.entity';
import { ReleaseStatus } from 'src/modules/release/enum/release.enum';
import { ReleaseService } from 'src/modules/release/services/release.service';
import { getFileExcelFromRaw } from 'src/utils/util.file';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
	BulkSyncDataCiDto,
	FieldOrderReleaseCiData,
	GetListReleaseCiDataDto,
	UpsertReleaseCiDataDto,
} from '../dto/release-ci-data.dto';
import {
	ReleaseCiData,
	ReleaseCiDataStatus,
	ReleaseCiExportParsedData,
	ReleaseCiImportParsedData,
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

		@Inject(forwardRef(() => ReleaseService))
		private readonly releaseService: ReleaseService,
	) {}

	async upsertByReleaseId(releaseId: string, data: UpsertReleaseCiDataDto) {
		if (data.importRawData !== undefined) {
			data.importParsedData = this.getLatestImportRecord(
				data.importRawData,
			);
		}

		if (data.exportRawData !== undefined) {
			data.exportParsedData = this.getLatestExportRecords(
				data.exportRawData,
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
		this.assignDspsLive(items);

		return new PageDto({
			items,
			metadata: { page, pageSize, totalItems },
		});
	}

	private assignDspsLive(items: ReleaseCiData[]): void {
		for (const item of items) {
			const count = item.exportParsedData?.length ?? 0;
			item.dspsLiveCount = count;
			item.dspsTotalCount = count;
			item.dspsLive = String(count);
		}
	}

	async exportData(filter: GetListReleaseCiDataDto) {
		const exportFilter = Object.assign(new GetListReleaseCiDataDto(), {
			...filter,
			page: 1,
			pageSize: 9999,
		});
		const qb = this.createQbGetList(exportFilter);
		const items = await qb.getMany();

		const records = items.map((item, index) => {
			const importLatest = item.importParsedData
				? `${item.importParsedData.modify_time ?? ''} | ${
						item.importParsedData.status ?? ''
					}`
				: '';

			return {
				STT: index + 1,
				Title: item.release?.title ?? '',
				UPC: item.release?.upc ?? '',
				Status: item.status ?? '',
				'Import cuối': importLatest,
				'DSP Success':
					item.exportParsedData
						?.map((data) => data.deliveryPoint)
						.filter(Boolean)
						.join(', ') ?? '',
			};
		});

		return getFileExcelFromRaw({
			records,
			fileName: `release_ci_data_${Date.now()}`,
			header: [
				'STT',
				'Title',
				'UPC',
				'Status',
				'Import cuối',
				'DSP Success',
			],
			sheetName: 'Release CI Data',
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
			},
		});

		if (!release) {
			throw new NotFoundException('Release not found');
		}

		if (!release.upc) {
			throw new BadRequestException('Release UPC is missing');
		}

		const releaseFormatId = await this.releaseService.getReleaseFormatId(
			release.id,
			{ reloadFromCi: true },
		);

		const [importRawData, exportRawData] = await Promise.all([
			this.ciImportService.getImports({
				package_id: release.upc,
				page_size: 999,
			}),
			this.ciExportService.getDeliverDesire({
				release_id: releaseFormatId,
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

	/**
	 * Dong bo lai du lieu CI cho nhieu release_ci_data record.
	 *
	 * Cach chon record can sync:
	 * - filter.ids: danh sach ID cua bang release_ci_data.
	 * - filter.releaseIds: danh sach release ID, se duoc doi sang release_ci_data ID
	 *   va merge chung voi filter.ids.
	 * - filter.latestSyncedAt = null: chi lay cac record chua tung sync.
	 * - Khong truyen filter: sync tat ca record release_ci_data.
	 *
	 * Ham xu ly theo batch nho de tranh goi CI API qua nhieu cung luc.
	 * Tung item trong batch duoc sync doc lap; item loi se duoc ghi vao errors
	 * nhung khong lam dung ca job.
	 */
	async bulkSyncDataCi(filter?: BulkSyncDataCiDto) {
		const batchSize = 5;
		const targetIds = new Set(filter?.ids ?? []);

		// FE co the truyen release ID hoac release_ci_data ID. Doi release ID
		// sang release_ci_data ID truoc de query chi can dung mot tap targetIds.
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

		// Neu co targetIds thi chi sync dung cac record duoc chi dinh.
		// Neu khong co, tiep tuc ap dung latestSyncedAt filter hoac sync tat ca.
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
		let liveVersionSynced = 0;
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

			// Goi sync song song trong tung batch; Promise.allSettled giup batch
			// tiep tuc xu ly cac item con lai neu mot item bi loi.
			const results = await Promise.allSettled(
				batch.map((item) => this.syncCiDataById(item.id)),
			);
			const syncedReleaseIds: string[] = [];

			results.forEach((result, resultIndex) => {
				const item = batch[resultIndex];

				if (result.status === 'fulfilled') {
					synced += 1;
					syncedReleaseIds.push(item.releaseId);
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

			// Sau khi sync CI thanh cong, cap nhat flag has_live_version cho
			// release_dsp_delivery dua tren exportParsedData moi nhat.
			liveVersionSynced +=
				await this.syncReleaseDspDeliveryLiveVersionFromCiData(
					syncedReleaseIds,
				);

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
			liveVersionSynced,
			failed: failed.length,
			errors: failed,
		};
	}

	private async syncReleaseDspDeliveryLiveVersionFromCiData(
		releaseIds: string[],
	): Promise<number> {
		const uniqueReleaseIds = [...new Set(releaseIds)].filter(Boolean);
		if (!uniqueReleaseIds.length) return 0;

		const rows = await this.repo.query(
			`
				UPDATE "release_dsp_delivery" rdd
				SET "has_live_version" = true
				FROM "release_ci_data" rcd
				INNER JOIN LATERAL jsonb_array_elements(rcd."export_parsed_data") AS export_item("value") ON true
				INNER JOIN "dsps" dsp
					ON upper(trim(dsp."code_ci")) = upper(trim(substring(
						export_item."value" ->> 'deliveryPoint'
						FROM '\\(([^()]*)\\)\\s*$'
					)))
				WHERE rdd."release_id" = rcd."release_id"
				AND rdd."dsp_id" = dsp."id"
				AND rcd."release_id" = ANY($1::uuid[])
				AND lower(coalesce(export_item."value" ->> 'deliveryPointStatus', '')) = 'live'
				AND substring(
					export_item."value" ->> 'deliveryPoint'
					FROM '\\(([^()]*)\\)\\s*$'
				) IS NOT NULL
				AND rdd."has_live_version" = false
				RETURNING rdd."id"
			`,
			[uniqueReleaseIds],
		);

		return Array.isArray(rows) ? rows.length : 0;
	}

	private getLatestImportRecord(
		importRawData?: Record<string, any> | null,
	): ReleaseCiImportParsedData | null {
		if (!importRawData) {
			return null;
		}

		const items = this.getImportItems(importRawData);
		if (!items.length) {
			return null;
		}

		const importEntity = items.sort((a, b) => {
			const aTime = new Date(a?.modify_time ?? 0).getTime();
			const bTime = new Date(b?.modify_time ?? 0).getTime();
			return bTime - aTime;
		})[0];

		return {
			status: importEntity.status ?? null,
			modify_time: importEntity.modify_time ?? null,
		};
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

	private getLatestExportRecords(
		exportRawData?: Record<string, any> | null,
	): ReleaseCiExportParsedData[] | null {
		if (!exportRawData) {
			return null;
		}

		const items = this.getExportItems(exportRawData);
		if (!items.length) {
			return [];
		}

		const latestByDsp = new Map<string, Record<string, any>>();

		for (const item of items) {
			const dspKey = this.getExportDspKey(item);
			const current = latestByDsp.get(dspKey);

			if (
				!current ||
				this.getExportRecordTime(item) >
					this.getExportRecordTime(current)
			) {
				latestByDsp.set(dspKey, item);
			}
		}

		return Array.from(latestByDsp.values()).map((item) =>
			this.mapExportRecord(item),
		);
	}

	private getExportItems(
		exportRawData: Record<string, any>,
	): Record<string, any>[] {
		if (Array.isArray(exportRawData)) {
			return exportRawData;
		}

		if (Array.isArray(exportRawData._embedded)) {
			return exportRawData._embedded;
		}

		if (Array.isArray(exportRawData._embedded?.items)) {
			return exportRawData._embedded.items;
		}

		if (Array.isArray(exportRawData.items)) {
			return exportRawData.items;
		}

		return [exportRawData];
	}

	private getExportDspKey(item: Record<string, any>): string {
		const musicService = item.musicService ?? {};
		return String(
			musicService.dpc ??
				musicService.DPID ??
				musicService.id ??
				musicService.name ??
				item.id,
		);
	}

	private getExportRecordTime(item: Record<string, any>): number {
		const rawTime =
			item.exportBatch?.transfer_end_time ??
			item.exportBatch?.modify_time ??
			item.modify_time ??
			item.exportRequest?.completion_date ??
			item.exportRequest?.modify_time ??
			item.create_time;

		return new Date(rawTime ?? 0).getTime();
	}

	private mapExportRecord(
		item: Record<string, any>,
	): ReleaseCiExportParsedData {
		const musicService = item.musicService ?? {};
		const exportRequest = item.exportRequest ?? {};
		const exportBatch = item.exportBatch ?? {};
		const dpc = musicService.dpc ? ` (${musicService.dpc})` : '';

		return {
			exportOrder: exportRequest.export_id ?? exportRequest.id ?? null,
			exportTask: exportRequest.task ?? null,
			requestorOrganisation: exportRequest.organisation?.name ?? null,
			deliveryPoint: musicService.name
				? `${musicService.name}${dpc}`
				: null,
			deliveryPointStatus: musicService.development_status ?? null,
			externalBatchId: exportBatch.external_batch_id ?? null,
			transferEndDate: this.formatCiDateTime(
				exportBatch.transfer_end_time ?? exportBatch.modify_time,
			),
		};
	}

	private formatCiDateTime(value?: string | null): string | null {
		if (!value) {
			return null;
		}

		const date = new Date(value);
		if (Number.isNaN(date.getTime())) {
			return value;
		}

		return date.toISOString().slice(0, 19).replace('T', ' ');
	}

	private createQbGetList(filter: GetListReleaseCiDataDto) {
		const qb = this.repo.createQueryBuilder('releaseCiData');
		qb.leftJoinAndSelect('releaseCiData.release', 'release');
		qb.addSelect(
			`COALESCE(jsonb_array_length("releaseCiData"."export_parsed_data"), 0)`,
			'dsps_live_count',
		);
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
		const {
			releaseId,
			status,
			keyword,
			neverExported,
			lastImportIsFailed,
		} = filter;

		if (releaseId) {
			qb.andWhere('releaseCiData.releaseId = :releaseId', { releaseId });
		}

		if (status) {
			qb.andWhere('releaseCiData.status = :status', { status });
		}

		if (neverExported) {
			qb.andWhere(
				`(
					"releaseCiData"."export_parsed_data" IS NULL
					OR jsonb_array_length("releaseCiData"."export_parsed_data") = 0
				)`,
			);
		}

		if (lastImportIsFailed) {
			qb.andWhere(
				`"releaseCiData"."import_parsed_data" ->> 'status' = :importStatus`,
				{ importStatus: 'problem' },
			);
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

		if (filter.fieldOrder === FieldOrderReleaseCiData.dspsLive) {
			qb.orderBy('dsps_live_count', filter.orderBy)
				.skip(filter.skip)
				.take(filter.limit);
			return;
		}

		orderAndPaging2({ qb, filter });
	}
}
