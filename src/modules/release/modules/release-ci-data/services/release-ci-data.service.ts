import {
	BadRequestException,
	Inject,
	Injectable,
	Logger,
	NotFoundException,
	forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { from, lastValueFrom } from 'rxjs';
import { mergeMap, toArray } from 'rxjs/operators';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { LogCategory, LogModule } from 'src/modules/log/entites/logs.entity';
import { LogsService } from 'src/modules/log/services/logs.services';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { CiExportService } from 'src/modules/partners-api/ci/services/ci-export.service';
import { CiImportService } from 'src/modules/partners-api/ci/services/ci-import.service';
import { CiReleaseService } from 'src/modules/partners-api/ci/services/ci-release.service';
import { Release } from 'src/modules/release/entities/release.entity';
import { ReleaseStatus } from 'src/modules/release/enum/release.enum';
import { ReleaseDspDeliveryService } from 'src/modules/release/services/release-dsp-services/release-dsp-delivery.service';
import { ReleaseService } from 'src/modules/release/services/release.service';
import { assignMatchTrack } from 'src/modules/release/utils/release-ci-data.util';
import { Track } from 'src/modules/track/entities/track.entity';
import { normalizeStr } from 'src/utils/string.util';
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

		@Inject(forwardRef(() => ReleaseDspDeliveryService))
		private readonly releaseDspDeliveryService: ReleaseDspDeliveryService,

		private readonly ciReleaseService: CiReleaseService,

		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,

		private readonly logsService: LogsService,
	) {}

	async upsertByReleaseId(
		releaseId: string,
		data: UpsertReleaseCiDataDto,
		options?: { skipSyncLiveVersionFromCiExportData?: boolean },
	) {
		if (data.importRawData !== undefined) {
			data.importParsedData = this.getLatestImportRecord(
				data.importRawData,
			);
			data.importCount = this.getImportCount(data.importRawData);
		}

		if (data.exportRawData !== undefined) {
			data.exportParsedData = this.getLatestExportRecords(
				data.exportRawData,
			);
		}

		if (data.status === ReleaseCiDataStatus.NOT_FOUND_ON_CI) {
			data.needImportAgain = true;
		}

		const entity = await this.repo.findOne({ where: { releaseId } });

		if (!entity) {
			const created = this.repo.create({
				releaseId,
				...data,
			});

			const saved = await this.repo.save(created);
			if (!options?.skipSyncLiveVersionFromCiExportData) {
				await this.releaseDspDeliveryService.syncLiveVersionFromCiExportData(
					[releaseId],
				);
			}

			return saved;
		}

		Object.assign(entity, data);

		entity.latestSyncedAt = new Date();
		await this.repo.save(entity);
		if (!options?.skipSyncLiveVersionFromCiExportData) {
			await this.releaseDspDeliveryService.syncLiveVersionFromCiExportData(
				[releaseId],
			);
		}

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

	async getList2(filter: GetListReleaseCiDataDto) {
		const { page, pageSize } = filter;

		const [items, totalItems] = await Promise.all([
			this.createQbGetList2(filter).getMany(),
			this.createQbGetList2(filter, true).getCount(),
		]);

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
				'Import count': item.importCount ?? 0,
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
				'Import count',
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
						needImportAgain: true,
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

	async syncCiDataByReleaseId(
		releaseId: string,
		options?: { skipSyncLiveVersionFromCiExportData?: boolean },
	) {
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

		let releaseFormatId: string;
		try {
			releaseFormatId = await this.releaseService.getReleaseFormatId(
				release.id,
				{ reloadFromCi: true },
			);
		} catch {
			return this.upsertByReleaseId(
				release.id,
				{
					status: ReleaseCiDataStatus.NOT_FOUND_ON_CI,
					importRawData: null,
					exportRawData: null,
					qaFlagsCi: null,
				},
				options,
			);
		}

		const [importRawData, exportRawData, qaFlagsCi] = await Promise.all([
			this.ciImportService.getImports({
				package_id: release.upc,
				page_size: 999,
			}),
			this.ciExportService.getDeliverDesire({
				release_id: releaseFormatId,
				pageSize: 999,
			}),
			this.releaseService.getQaFlagsCi(release.id, {
				reloadFromCi: true,
			}),
		]);

		const needImportAgain = this.shouldNeedImportAgain(
			ReleaseCiDataStatus.EXISTS_ON_CI,
			importRawData,
			exportRawData,
			qaFlagsCi,
		);

		return this.upsertByReleaseId(
			release.id,
			{
				status: ReleaseCiDataStatus.EXISTS_ON_CI,
				importRawData,
				exportRawData,
				qaFlagsCi,
				needImportAgain,
			},
			options,
		);
	}

	async syncCiDataById(
		id: string,
		options?: { skipSyncLiveVersionFromCiExportData?: boolean },
	) {
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

		return this.syncCiDataByReleaseId(ciData.releaseId, options);
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
				batch.map((item) =>
					this.syncCiDataById(item.id, {
						skipSyncLiveVersionFromCiExportData: true,
					}),
				),
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

			liveVersionSynced +=
				await this.releaseDspDeliveryService.syncLiveVersionFromCiExportData(
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

		const importBatch = items.sort((a, b) => {
			const aTime = new Date(a?.modify_time ?? 0).getTime();
			const bTime = new Date(b?.modify_time ?? 0).getTime();
			return bTime - aTime;
		})[0];

		const targetPackageId = importRawData.queryParams?.package_id;

		let actualStatus = null;
		if (Array.isArray(importBatch.import_file)) {
			const targetFile = importBatch.import_file.find(
				(file: any) =>
					file.package_id === targetPackageId ||
					file.GTIN === targetPackageId,
			);

			actualStatus = targetFile?.import_status ?? null;
		}

		return {
			status: actualStatus,
			modify_time: importBatch.modify_time ?? null,
		};
	}

	private getImportCount(importRawData?: Record<string, any> | null): number {
		if (!importRawData) {
			return 0;
		}

		return this.getImportItems(importRawData).length;
	}

	private shouldNeedImportAgain(
		status: ReleaseCiDataStatus,
		importRawData?: Record<string, any> | null,
		exportRawData?: Record<string, any> | null,
		qaFlagsCi?: Record<string, any>[] | null,
	): boolean {
		if (status === ReleaseCiDataStatus.NOT_FOUND_ON_CI) {
			return true;
		}

		const latestImport = this.getLatestImportRecord(importRawData);
		const lastImportIsFailed = latestImport?.status === 'problem';
		const hasQaFlag = (qaFlagsCi?.length ?? 0) > 0;
		const hasExportOnCi = exportRawData
			? this.getExportItems(exportRawData).length > 0
			: false;

		return lastImportIsFailed || hasQaFlag || !hasExportOnCi;
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
		const deliveryPointCode = musicService.dpc ?? null;
		const deliveryPointDpid = musicService.DPID ?? null;
		const deliveryPointId = musicService.id ?? null;
		const dpc = musicService.dpc ? ` (${musicService.dpc})` : '';

		return {
			exportOrder: exportRequest.export_id ?? exportRequest.id ?? null,
			exportTask: exportRequest.task ?? null,
			requestorOrganisation: exportRequest.organisation?.name ?? null,
			deliveryPoint: musicService.name
				? `${musicService.name}${dpc}`
				: null,
			deliveryPointCode,
			deliveryPointDpid,
			deliveryPointId,
			deliveryPointStatus:
				exportBatch.batch_transfer_status ??
				item.status ??
				musicService.development_status ??
				null,
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
			needImportAgain,
			isSkipImport,
			hasQaFlag,
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

		if (needImportAgain !== undefined) {
			qb.andWhere(
				`"releaseCiData"."need_import_again" = :needImportAgain`,
				{ needImportAgain },
			);
		}

		if (isSkipImport !== undefined) {
			qb.andWhere(
				`"releaseCiData"."need_import_again" = :isNeedImportAgain`,
				{ isNeedImportAgain: !isSkipImport },
			);
		}

		if (hasQaFlag !== undefined) {
			const hasQaFlagCondition = `
				COALESCE(jsonb_array_length("releaseCiData"."qa_flags_ci"), 0) > 0
			`;

			qb.andWhere(
				hasQaFlag ? hasQaFlagCondition : `NOT (${hasQaFlagCondition})`,
			);
		}

		if (keyword?.length) {
			const keywords = keyword.map((k) => `%${k}%`);

			qb.andWhere(
				`(
					"releaseCiData"."status"::text ILIKE ANY(:keywords)
					OR release.title ILIKE ANY(:keywords)
					OR release.upc ILIKE ANY(:keywords)
					OR "releaseCiData"."qa_flags_ci"::text ILIKE ANY(:keywords)
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

	private createQbGetList2(filter: GetListReleaseCiDataDto, isCount = false) {
		const qb = this.repo.createQueryBuilder('releaseCiData');

		if (!isCount) {
			qb.leftJoinAndSelect('releaseCiData.release', 'release');
			qb.addSelect(
				`COALESCE(jsonb_array_length("releaseCiData"."export_parsed_data"), 0)`,
				'dsps_live_count',
			);
		} else if (filter.keyword?.length) {
			qb.leftJoin('releaseCiData.release', 'release');
		}

		this.applyFilter2({ qb, filter, isCount });
		return qb;
	}

	private applyFilter2({
		qb,
		filter,
		isCount = false,
	}: {
		qb: SelectQueryBuilder<ReleaseCiData>;
		filter: GetListReleaseCiDataDto;
		isCount?: boolean;
	}) {
		const {
			releaseId,
			status,
			keyword,
			neverExported,
			lastImportIsFailed,
			needImportAgain,
			isSkipImport,
			hasQaFlag,
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

		if (needImportAgain !== undefined) {
			qb.andWhere(
				`"releaseCiData"."need_import_again" = :needImportAgain`,
				{ needImportAgain },
			);
		}

		if (isSkipImport !== undefined) {
			qb.andWhere(
				`"releaseCiData"."need_import_again" = :isNeedImportAgain`,
				{ isNeedImportAgain: !isSkipImport },
			);
		}

		if (hasQaFlag !== undefined) {
			const hasQaFlagCondition = `
				COALESCE(jsonb_array_length("releaseCiData"."qa_flags_ci"), 0) > 0
			`;

			qb.andWhere(
				hasQaFlag ? hasQaFlagCondition : `NOT (${hasQaFlagCondition})`,
			);
		}

		if (keyword?.length) {
			const isUpcSearch = keyword.every((k) =>
				/^\d{12,14}$/.test(k.trim()),
			);

			if (isUpcSearch) {
				qb.andWhere('release.upc IN (:...keyword)', {
					keyword: keyword.map((k) => k.trim()),
				});
			} else {
				const keywords = keyword.map((k) => `%${k}%`);
				qb.andWhere(`release.title ILIKE ANY(:keywords)`, { keywords });
			}
		}

		if (isCount) return;

		if (filter.fieldOrder === FieldOrderReleaseCiData.dspsLive) {
			qb.orderBy('dsps_live_count', filter.orderBy)
				.skip(filter.skip)
				.take(filter.limit);
			return;
		}

		orderAndPaging2({ qb, filter });
	}

	async bulkSyncTrackOrder(filter?: BulkSyncDataCiDto) {
		const {
			ids = [],
			releaseIds: filterReleaseIds = [],
			latestSyncedAt,
		} = filter ?? {};

		const concurrency = 5;
		const targetReleaseIds = new Set<string>(filterReleaseIds);
		const hasFilterIds = ids.length > 0 || filterReleaseIds.length > 0;

		if (ids.length > 0) {
			const ciDataItems = await this.repo
				.createQueryBuilder('releaseCiData')
				.select(['releaseCiData.releaseId'])
				.where('releaseCiData.id IN (:...ids)', { ids })
				.getMany();

			ciDataItems.forEach((item) => targetReleaseIds.add(item.releaseId));
		}

		if (hasFilterIds && targetReleaseIds.size === 0) {
			this.logger.log('No releases found for bulk sync track order.');
			return {
				total: 0,
				batchSize: concurrency,
				synced: 0,
				failed: 0,
				errors: [],
			};
		}

		const qb = this.releaseRepo
			.createQueryBuilder('release')
			.select(['release.id'])
			.innerJoin('release.ciData', 'ciData')
			.where('release.upc IS NOT NULL')
			.andWhere("release.upc != ''")
			.andWhere('ciData.status = :ciStatus', {
				ciStatus: ReleaseCiDataStatus.EXISTS_ON_CI,
			})
			.andWhere(
				`("ciData"."import_parsed_data" ->> 'status' != 'complete' OR "ciData"."import_parsed_data" ->> 'status' IS NULL)`,
			);

		if (targetReleaseIds.size > 0) {
			qb.andWhere('release.id IN (:...ids)', {
				ids: Array.from(targetReleaseIds),
			});
		} else if (latestSyncedAt === null) {
			qb.andWhere('ciData.latestSyncedAt IS NULL');
		}

		const pendingItems = await qb
			.orderBy('release.createdAt', 'ASC')
			.getMany();
		const releaseIds = pendingItems.map((item) => item.id);

		if (releaseIds.length === 0) {
			this.logger.log('No releases found for bulk sync track order.');
			return {
				total: 0,
				batchSize: concurrency,
				synced: 0,
				failed: 0,
				errors: [],
			};
		}

		let synced = 0;
		let skipped = 0;
		const failed: { releaseId: string; message: string }[] = [];

		this.logger.log(
			`Starting bulk sync track order. Total pending: ${releaseIds.length}, concurrency: ${concurrency}`,
		);

		const syncProcess$ = from(releaseIds).pipe(
			mergeMap(async (releaseId) => {
				try {
					await this.syncTrackOrderByReleaseId(releaseId);
					synced += 1;
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);

					// Lọc bỏ những release không có trên CI
					if (
						message.includes('Release not found on CI') ||
						message.includes('Release UPC is missing') ||
						message.includes('No tracks found in CI')
					) {
						this.logger.warn(
							`Skipped release ${releaseId}: ${message}`,
						);
						skipped += 1;
						return;
					}

					failed.push({ releaseId, message });
					this.logger.error(
						`Failed to sync track order for release ${releaseId}. Error: ${message}`,
					);
				}
			}, concurrency),
			toArray(),
		);

		await lastValueFrom(syncProcess$);

		this.logger.log(
			`Finished bulk sync track order. Total: ${releaseIds.length}, synced: ${synced}, skipped: ${skipped}, failed: ${failed.length}`,
		);

		return {
			total: releaseIds.length,
			batchSize: concurrency,
			synced,
			skipped,
			failed: failed.length,
			errors: failed,
		};
	}

	async syncTrackOrderByReleaseId(releaseId: string) {
		const release = await this.releaseRepo.findOne({
			where: { id: releaseId },
			select: { id: true, upc: true, title: true },
			relations: { tracks: true },
		});

		if (!release) throw new NotFoundException('Release not found');
		if (!release.upc) {
			throw new BadRequestException('Release UPC is missing');
		}

		if (!release.tracks?.length) return;

		// 1. Lấy release_id từ CI qua API v1
		const ciReleases = await this.ciReleaseService.getReleasesV1({
			gtin: [release.upc],
		});

		const embedded = ciReleases?._embedded;
		const ciReleaseId = embedded?.[embedded.length - 1]?.id;
		if (!ciReleaseId) {
			throw new BadRequestException('Release not found on CI (V1)');
		}

		// 2. Lấy metadata chứa mảng track[] có field track_number
		const metadata =
			await this.ciReleaseService.getReleaseMetadataV1(ciReleaseId);
		const ciTracks = metadata?.tracks;
		if (!Array.isArray(ciTracks) || !ciTracks.length) {
			throw new BadRequestException(
				`No tracks found in CI metadata for release ${releaseId}`,
			);
		}

		const ciTrackByIsrc = new Map<string, any>();
		const ciTrackByTitle = new Map<string, any[]>();

		for (const ciTrack of ciTracks) {
			const isrc = ciTrack.recording?.isrc?.toUpperCase();
			if (isrc && !ciTrackByIsrc.has(isrc)) {
				ciTrackByIsrc.set(isrc, ciTrack);
			}

			const titleNorm = normalizeStr(ciTrack.recording?.title);
			if (!titleNorm) continue;

			if (!ciTrackByTitle.has(titleNorm)) {
				ciTrackByTitle.set(titleNorm, []);
			}
			ciTrackByTitle.get(titleNorm)!.push(ciTrack);
		}

		const trackTempOrders = release.tracks.map((track) => ({
			track,
			tempOrder: track.order,
			matchType: 'UNMATCHED',
			matchedCiTrack: null as any,
		}));

		const usedCiTracks = new Set<any>();

		// TẦNG 1: Map theo ISRC (O(N))
		for (const item of trackTempOrders) {
			if (!item.track.isrc) continue;
			const ciTrack = ciTrackByIsrc.get(item.track.isrc.toUpperCase());
			if (ciTrack && !usedCiTracks.has(ciTrack)) {
				assignMatchTrack(item, ciTrack, 'ISRC', usedCiTracks);
			}
		}

		// TẦNG 2: Map theo Title
		for (const item of trackTempOrders.filter(
			(t) => t.matchType === 'UNMATCHED',
		)) {
			const dbTitleNorm = normalizeStr(item.track.title);
			if (!dbTitleNorm) continue;
			const ciTrackList = ciTrackByTitle.get(dbTitleNorm);
			if (ciTrackList) {
				// Tìm track đầu tiên có cùng tên mà chưa bị dùng
				const unusedCiTrack = ciTrackList.find(
					(ci) => !usedCiTracks.has(ci),
				);
				if (unusedCiTrack) {
					assignMatchTrack(
						item,
						unusedCiTrack,
						'TITLE',
						usedCiTracks,
					);
				}
			}
		}

		// Chuẩn bị danh sách CI tracks còn thừa lại cho Tầng 3 (O(M))
		const remainingCiTracks = ciTracks.filter(
			(ci) => !usedCiTracks.has(ci),
		);
		// TẦNG 3: Map theo Vị trí trống (O(N))
		for (const item of trackTempOrders.filter(
			(t) => t.matchType === 'UNMATCHED',
		)) {
			if (remainingCiTracks.length > 0) {
				assignMatchTrack(
					item,
					remainingCiTracks.shift(),
					'INDEX',
					usedCiTracks,
				);
			}
		}

		// TẦNG 4: Đẩy xuống cuối cùng (O(N))
		for (const item of trackTempOrders.filter(
			(t) => t.matchType === 'UNMATCHED',
		)) {
			item.tempOrder = 999999;
			item.matchType = 'APPEND';
		}

		// Sắp xếp các track theo thứ tự tạm thời
		trackTempOrders.sort((a, b) => {
			if (a.tempOrder !== b.tempOrder) {
				return a.tempOrder - b.tempOrder;
			}
			const orderDiff = (a.track.order || 0) - (b.track.order || 0);
			if (orderDiff !== 0) return orderDiff;
			return a.track.id.localeCompare(b.track.id);
		});

		// Dồn hàng: Đánh số lại từ 1 đến N để đảm bảo không bị đứt đoạn (gaps)
		const finalOrders = new Map<string, number>();
		let currentOrder = 1;
		for (const item of trackTempOrders) {
			finalOrders.set(item.track.id, currentOrder);
			currentOrder++;
		}

		const tracksToUpdate = trackTempOrders.filter(
			(item) => finalOrders.get(item.track.id) !== item.track.order,
		);

		if (tracksToUpdate.length > 0) {
			const offset = Date.now() % 1000000000;
			const idList = tracksToUpdate
				.map((t) => `'${t.track.id}'`)
				.join(',');

			// BULK PHASE 1: Dọn chỗ bằng số âm để tránh Duplicate Key
			const phase1Cases = tracksToUpdate
				.map(
					(t, idx) =>
						`WHEN "id" = '${t.track.id}' THEN -(${offset} + ${idx})`,
				)
				.join(' ');

			await this.trackRepo.query(
				`UPDATE "tracks" SET "order" = CASE ${phase1Cases} END WHERE "id" IN (${idList})`,
			);

			// BULK PHASE 2: Gán order thật
			const phase2Cases = tracksToUpdate
				.map(
					(t) =>
						`WHEN "id" = '${t.track.id}' THEN ${finalOrders.get(t.track.id)}`,
				)
				.join(' ');

			await this.trackRepo.query(
				`UPDATE "tracks" SET "order" = CASE ${phase2Cases} END WHERE "id" IN (${idList})`,
			);
		}

		// Ghi log cho Admin
		for (const item of trackTempOrders) {
			const track = item.track;
			const newOrder = finalOrders.get(track.id) ?? 0;
			const oldOrder = track.order;

			// Thoát sớm nếu không có sự thay đổi order
			if (oldOrder === newOrder) continue;

			const baseData = {
				releaseId,
				trackId: track.id,
				isrc: track.isrc,
				oldOrder,
				newOrder,
				matchedCiIsrc: item.matchedCiTrack?.recording?.isrc,
			};

			const trackInfo = `Release: ${release.title} (${release.upc}) | Track: ${track.title} (${track.isrc || 'No ISRC'})`;

			switch (item.matchType) {
				case 'TITLE':
					this.logsService.warning({
						module: LogModule.RELEASE,
						type: LogCategory.BUSINESS,
						message: `[WARNING] | ${trackInfo} | ISRC mismatched but Title matched. Automatically placed at position ${newOrder}.`,
						data: baseData,
					});
					break;

				case 'INDEX':
					this.logsService.warning({
						module: LogModule.RELEASE,
						type: LogCategory.BUSINESS,
						message: `[WARNING] | ${trackInfo} | ISRC and Title mismatched. Automatically placed in empty position ${newOrder} using elimination method.`,
						data: baseData,
					});
					break;

				case 'APPEND':
					this.logsService.warning({
						module: LogModule.RELEASE,
						type: LogCategory.BUSINESS,
						message: `[WARNING] | ${trackInfo} | Extra track compared to CI. Automatically appended to the end of the list (New position: ${newOrder}).`,
						data: baseData,
					});
					break;

				default:
					this.logsService.log({
						module: LogModule.RELEASE,
						type: LogCategory.BUSINESS,
						message: `[UPDATE] | ${trackInfo} | Changed order from ${oldOrder} to ${newOrder}`,
						data: baseData,
					});
					break;
			}
		}
	}
}
