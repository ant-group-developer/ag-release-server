import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import archiver from 'archiver';
import axios from 'axios';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { BucketService2 } from 'src/modules/bucket2/services/bucket2.service';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { DspCode } from 'src/modules/dsp/enum/dsp.enum';
import {
	CreateUpc,
	UpcIndustry,
	UpcLanguage,
	UpcPackagingLevel,
	UpcStatus,
	UpcYesNo,
} from 'src/modules/external/upc/upc.grpc.interface';
import { UpcService } from 'src/modules/external/upc/upc.service';
import { FileExportCiService } from 'src/modules/file-export-ci/file-export-ci.service';
import { ReleaseDspDelivery } from 'src/modules/release-dsp-delivery/entities/release-dsp-delivery.entity';
import { ReleaseDspStatus } from 'src/modules/release-dsp-delivery/enum/release-dsp.enum';
import { TrackService } from 'src/modules/track/services/track.service';
import { getCoverArtThumbnails } from 'src/utils/util';
import {
	getFileCsvFromRaw,
	getFileExcelFromRaw,
	getFileTxtFromRelease,
} from 'src/utils/util.file';
import { PassThrough } from 'stream';
import { In, Repository } from 'typeorm';
import { ReleaseQueryDspDeliveryDto } from '../dto/release-query-dsp-delivey.dto';
import {
	FileExportReleaseCiDto,
	QueryGetListReleaseDto,
	QueryGetListReleaseDto2,
	UpdateReleaseDto,
} from '../dto/release.dto';
import { SubmitReleaseDto } from '../dto/submit-release.dto';
import { ReleaseLog, ReleaseLogStatus } from '../entities/release-log.entity';
import { Release } from '../entities/release.entity';
import { ReleaseStatus } from '../enum/release.enum';
import { IRelease, IReleaseDetail } from '../interfaces/release.interface';
import { enhanceReleasesDetails } from '../utils/release.utils';
import { ReleaseLogService } from './release-log.service';
import { ReleaseDdexCiService } from './release.ddex-ci.service';
import { ReleaseSpotifyService2 } from './release.ddex-spotify2.service';
import { ReleaseQueryService } from './release.query.service';
import { ReleaseValidateService } from './release.validate.service';

@Injectable()
export class ReleaseService {
	private readonly logger = new Logger('ReleaseSpotifyService');
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		@InjectRepository(ReleaseLog)
		private readonly releaseLogRepo: Repository<ReleaseLog>,

		private readonly releaseLogService: ReleaseLogService,

		private readonly releaseValidateService: ReleaseValidateService,
		private readonly releaseQueryService: ReleaseQueryService,

		private readonly bucketService: BucketService2,

		private readonly releaseDdexCiService: ReleaseDdexCiService,
		private readonly releaseDdexSpotifyService2: ReleaseSpotifyService2,

		private readonly upcService: UpcService,
		private readonly trackService: TrackService,
		private readonly appConfigService: AppConfigService,

		@InjectRepository(ReleaseDspDelivery)
		private readonly releaseDspDeliveryRepo: Repository<ReleaseDspDelivery>,

		private readonly fileExportCiService: FileExportCiService,

		@InjectRepository(Dsp)
		private readonly dspRepo: Repository<Dsp>,
	) {}

	async getOne(id: string): Promise<IReleaseDetail> {
		const release = await this.releaseQueryService.getOneDetail(id);

		const { releaseCoverArts, ...restOfRelease } = release;

		const coverArtThumbnails = getCoverArtThumbnails(releaseCoverArts);

		return {
			...restOfRelease,
			coverArtThumbnails,
		};
	}

	async findOneFull(id: string) {
		const release = await this.releaseQueryService.findOneReleaseFull(id);

		const { releaseCoverArts, ...restOfRelease } = release;

		const coverArtThumbnails = getCoverArtThumbnails(releaseCoverArts);

		return {
			...restOfRelease,
			coverArtThumbnails,
		};
	}

	async getList(
		query: QueryGetListReleaseDto,
	): Promise<PageDto<IReleaseDetail>> {
		const { page, pageSize } = query;

		const { releases, totalItems } =
			await this.releaseQueryService.getManyAndCount(query);

		const enhancedRelease = enhanceReleasesDetails(releases);

		return new PageDto({
			items: enhancedRelease,
			metadata: {
				page,
				pageSize,
				totalItems,
			},
		});
	}

	async getListFull(query: QueryGetListReleaseDto) {
		const { items, totalItems } =
			await this.releaseQueryService.getListFull(query);

		return new PageDto({
			items,
			metadata: {
				...query,
				totalItems,
			},
		});
	}

	async getList2(
		query: QueryGetListReleaseDto2,
	): Promise<PageDto<IReleaseDetail>> {
		const { page, pageSize } = query;

		const { releases, totalItems } =
			await this.releaseQueryService.getManyAndCount(query);

		const enhancedRelease = enhanceReleasesDetails(releases);

		return new PageDto({
			items: enhancedRelease,
			metadata: {
				page,
				pageSize,
				totalItems,
			},
		});
	}

	async getListSimple(
		query: QueryGetListReleaseDto,
	): Promise<PageDto<Release>> {
		const { page, pageSize } = query;

		const { items, totalItems } =
			await this.releaseQueryService.getListSimple(query);

		return new PageDto({
			items: items,
			metadata: {
				page,
				pageSize,
				totalItems,
			},
		});
	}

	// file export ci
	async listCodeExportCiById(id: string) {
		const release = await this.releaseQueryService.findOneReleaseFull(id);

		return release.listCodeExportCi;
	}

	async dataExportCiById(id: string) {
		const { listCodeExportCi: listCodeDspCi, upc } =
			await this.releaseQueryService.findOneReleaseFull(id);

		return {
			listCodeDspCi,
			upc,
		};
	}

	async listDataExportCi(query: QueryGetListReleaseDto2) {
		const res = await this.getListFull(query);
		const records = res.items.map((r) => this.dataExportCi(r));

		return records;
	}

	dataExportCi(release: Release) {
		return {
			listCodeDspCi: release.listCodeExportCi,
			upc: release.upc,
		};
	}

	async getFileExportCiById(id: string) {
		const record = await this.dataExportCiById(id);

		return await this.fileExportCiService.createFileExportCi({
			data: [record],
		});
	}

	async getFileExportListReleaseCi(query: QueryGetListReleaseDto2) {
		const res = await this.getListFull(query);

		const records = res.items
			.filter((r) => r.upc != null)
			.map((r) => this.dataExportCi(r));

		const result = await this.fileExportCiService.createFileExportCi({
			data: records,
		});

		return result;
	}

	async getFileExportListReleaseCiByDspCode(data: FileExportReleaseCiDto) {
		const query = new QueryGetListReleaseDto();
		query.ids = data.ids;

		const res = await this.getListFull(query);

		const records = res.items.map((r) => ({
			listCodeDspCi: data.dspCodeCi,
			upc: r.upc,
		}));

		const result = await this.fileExportCiService.createFileExportCi({
			data: records,
		});

		return result;
	}

	//

	async update(
		id: string,
		data: UpdateReleaseDto,
		userId?: string,
	): Promise<IRelease> {
		const { labelId, primaryGenreId, subGenreId, releaseTimezoneId } = data;

		const release = await this.releaseQueryService.findOne(id);

		if (release.status === ReleaseStatus.DRAFT) {
			throw new ResponseError({
				message: 'Error release.status',
			});
		}

		if (labelId && labelId !== release.labelId) {
			await this.releaseValidateService.validate({
				labelId,
			});
		}

		if (primaryGenreId && primaryGenreId !== release.primaryGenreId) {
			await this.releaseValidateService.validate({
				primaryGenreId,
			});
		}

		if (subGenreId && subGenreId !== release.subGenreId) {
			await this.releaseValidateService.validate({
				subGenreId,
			});
		}

		if (
			releaseTimezoneId &&
			releaseTimezoneId !== release.releaseTimezoneId
		) {
			await this.releaseValidateService.validate({
				releaseTimezoneId,
			});
		}

		await this.releaseRepo.update(id, { ...data, modifierId: userId });
		return await this.releaseQueryService.findOne(id);
	}

	async getFileCsvMetadata(releaseId: string) {
		const dataRaw =
			await this.releaseQueryService.getMetadataRaw(releaseId);
		return getFileCsvFromRaw({
			records: [dataRaw],
			fileName: dataRaw.release_name,
		});
	}

	async getFileXlsxMetadata(releaseId: string) {
		const dataRaw =
			await this.releaseQueryService.getMetadataRaw(releaseId);
		return getFileExcelFromRaw({
			records: [dataRaw],
			fileName: dataRaw.release_name,
		});
	}

	async getFileTxtMetadata(releaseId: string) {
		const release = await this.releaseQueryService.getMetadata(releaseId);
		return getFileTxtFromRelease({
			release,
			fileName: release.title,
		});
	}

	async getAssets(releaseId: string) {
		const zipStream = new PassThrough();
		const archive = archiver('zip', { zlib: { level: 9 } });
		archive.pipe(zipStream);

		const { releaseName, coverArt, listAudios } =
			await this.releaseQueryService.getFileIdAssetsRelease(releaseId);

		if (coverArt.fileId) {
			const streamCoverArt = await this.streamFileOnBucket(
				coverArt.fileId,
			);
			archive.append(streamCoverArt.stream, {
				name: coverArt.name || 'cover.jpg',
			});
		}

		for (const item of listAudios) {
			if (item.fileId) {
				const streamAudio = await this.streamFileOnBucket(item.fileId);

				archive.append(streamAudio.stream, {
					name: item.name || 'item.wav',
				});
			}
		}

		archive.finalize().catch((_e) => {});

		return {
			contentType: 'application/zip',
			stream: zipStream,
			fileName: `${releaseName}assets.zip`,
		};
	}

	async getCoverArtStream(releaseId: string) {
		const { coverArt } =
			await this.releaseQueryService.getFileIdAssetsRelease(releaseId);

		const { stream, contentType } = await this.streamFileOnBucket(
			coverArt.fileId,
		);

		return {
			stream,
			contentType,
			fileName: coverArt.name,
		};
	}

	private async streamFileOnBucket(fileId?: string | null) {
		if (!fileId) {
			throw new ResponseError({ message: 'Resource not found' });
		}

		const url = await this.bucketService.getUrlDown(fileId);
		return this.getStream(url);
	}

	private async getStream(url: string) {
		const response = await axios.get(url, {
			responseType: 'stream',
		});

		return {
			stream: response.data,
			contentType: response.headers['content-type'],
		};
	}

	async genUpc(releaseId: string) {
		const release = await this.releaseQueryService.getOneDetail(releaseId);

		// Nếu release đã có UPC
		if (release.upc) {
			return { upc: release.upc, alreadyExists: true };
		}

		const prefixUpcId =
			this.appConfigService.cache.config.generator.prefixUpcDefaultId;

		if (!prefixUpcId) {
			this.releaseLogService.failed({
				releaseId,
				step: 'Khởi tạo UPC',
				content: release,
				message: 'Bản phát hành chưa được gắn mã Prefix UPC',
			});

			throw new ResponseError({
				message: 'Bản phát hành chưa được gắn mã Prefix UPC',
			});
		}

		const payload: CreateUpc = {
			prefixUpcId,

			packagingLevel: UpcPackagingLevel.EACH,

			description: release.title,
			desc1Language: UpcLanguage.EN,

			brandName: release.label?.name ?? '',
			brand1Language: UpcLanguage.EN,

			status: UpcStatus.IN_USE, // không có ACTIVE
			industry: UpcIndustry.GENERAL, // không có MUSIC

			isVariable: UpcYesNo.NO,
			isPurchasable: UpcYesNo.YES,
			isAdded: UpcYesNo.NO,

			targetMarkets: ['VN'],
		};

		const res = await this.upcService.create(payload);

		const newUpc = res.data.gtin; // theo proto UpcItem
		if (!newUpc) {
			this.releaseLogService.failed({
				releaseId,
				step: 'Khởi tạo UPC',
				content: release,
				message: 'Dịch vụ cấp UPC không phản hồi mã GTIN',
			});

			throw new ResponseError({
				message: 'Service UPC không trả về GTIN',
			});
		}

		// -------- Update release --------
		await this.releaseRepo.update(releaseId, { upc: newUpc });

		// await this.releaseLogRepo.insert({
		// 	status: ReleaseLogStatus.SUCCESS,
		// 	releaseId,
		// 	logs: 'Cấp mã UPC thành công',
		// 	step: 'Khởi tạo UPC',
		// });

		return newUpc;
	}

	// distribution
	async getReleaseDspDelivery(
		releaseId: string,
		query: ReleaseQueryDspDeliveryDto,
	) {
		const { keyword, status, fieldOrder, orderBy, skip, limit } = query;
		const dsps = await this.dspRepo.find({
			where: { isActive: true },
			select: ['id'],
		});

		const existDeliveries = await this.releaseDspDeliveryRepo.find({
			where: { releaseId },
			select: ['dspId'],
		});

		const existDspIds = new Set(existDeliveries.map((d) => d.dspId));

		const newRecords = dsps
			.filter((dsp) => !existDspIds.has(dsp.id))
			.map((dsp) => ({
				releaseId,
				dspId: dsp.id,
				status: ReleaseDspStatus.NEVER_DISTRIBUTED,
				lastEnqueuedAt: null,
				lastDeliveredAt: null,
			}));

		if (newRecords.length) {
			await this.releaseDspDeliveryRepo.insert(newRecords);
		}

		const qb = this.dspRepo
			.createQueryBuilder('dsp')
			.leftJoin(
				ReleaseDspDelivery,
				'delivery',
				'delivery.dspId = dsp.id AND delivery.releaseId = :releaseId',
				{ releaseId },
			)
			.where('dsp.isActive = true');

		if (keyword) {
			qb.andWhere(
				'(dsp.name ILIKE :keyword OR dsp.code ILIKE :keyword)',
				{
					keyword: `%${keyword}%`,
				},
			);
		}

		if (status) {
			qb.andWhere('COALESCE(delivery.status, :defaultStatus) = :status', {
				status,
				defaultStatus: ReleaseDspStatus.NEVER_DISTRIBUTED,
			});
		}

		const sortableFields: Record<string, string> = {
			dsp_name: 'dsp.name',
			dsp_code: 'dsp.code',
			status: 'delivery.status',
			lastEnqueuedAt: 'delivery.lastEnqueuedAt',
			lastDeliveredAt: 'delivery.lastDeliveredAt',
			createdAt: 'dsp.createdAt',
		};

		const sortField = sortableFields[fieldOrder] ?? 'dsp.createdAt';

		qb.orderBy(sortField, orderBy.toUpperCase() as 'ASC' | 'DESC');

		const total = await qb.clone().getCount();

		qb.skip(skip).take(limit);

		const raw = await qb
			.select([
				'dsp.id as dsp_id',
				'dsp.name as dsp_name',
				'dsp.code as dsp_code',
				'dsp.picture as dsp_picture',
				'delivery.status as delivery_status',
				'delivery.last_enqueued_at as delivery_last_enqueued_at',
				'delivery.last_delivered_at as delivery_last_delivered_at',
				'delivery.logs as logs',
				'delivery.is_selected as delivery_is_selected',
			])
			.getRawMany();

		const items = raw.map((row) => ({
			dsp: {
				id: row.dsp_id,
				name: row.dsp_name,
				code: row.dsp_code,
				picture: row.dsp_picture,
			},
			status: row.delivery_status ?? ReleaseDspStatus.NEVER_DISTRIBUTED,
			lastEnqueuedAt: row.delivery_last_enqueued_at,
			lastDeliveredAt: row.delivery_last_delivered_at,
			logs: row.logs,
			isSelected: row.delivery_is_selected ?? true,
		}));

		return {
			items,
			metadata: {
				totalItems: total,
				totalPages: Math.ceil(total / limit),
				page: Math.floor(skip / limit) + 1,
				pageSize: limit,
			},
		};
	}

	// nghiệp vụ
	async submit(id: string, userId: string, dto: SubmitReleaseDto) {
		await this.releaseRepo.update(id, { status: ReleaseStatus.PROCESSING });
		await this.handleSelected(id, dto.code);

		this.releaseLogService.pending({
			releaseId: id,
			step: 'Bắt đầu xử lý phát hành',
			message: 'Bản phát hành đang được đưa vào hàng đợi xử lý',
		});

		this.processingSubmit({ id, userId, dto }).catch(async (error) => {
			await this.releaseRepo.update(id, {
				status: ReleaseStatus.ISSUES,
			});

			this.releaseLogService.failed({
				releaseId: id,
				step: 'Lỗi phát hành',
				message: `Lỗi bất ngờ: ${error?.message ?? 'Không xác định'}`,
			});
		});

		return { message: 'Đang được xử lý' };
	}

	async handleSelected(releaseId: string, codes: string[]) {
		const normalizedCodes = [
			...new Set((codes || []).map((i) => i?.trim()).filter(Boolean)),
		];

		const dsps = await this.dspRepo.find({
			where: {
				code: In(normalizedCodes),
			},
			select: ['id', 'code'],
		});

		const dspIdsSelected = dsps.map((dsp) => dsp.id);

		await this.releaseDspDeliveryRepo.update(
			{ releaseId },
			{ isSelected: false },
		);

		if (dspIdsSelected.length > 0) {
			await this.releaseDspDeliveryRepo.update(
				{
					releaseId,
					dspId: In(dspIdsSelected),
				},
				{ isSelected: true },
			);
		}
	}

	async processingSubmit({
		id,
		userId,
		dto,
	}: {
		id: string;
		userId: string;
		dto: SubmitReleaseDto;
	}) {
		const release = await this.releaseQueryService.findOneWithRelation(id);

		// gen upc, isrc
		if (!release.upc) {
			await this.genUpc(id);
		}

		for (const track of release.tracks) {
			if (!track.isrc) {
				await this.trackService.genISRC(track.id);
			}
		}

		const errors =
			this.releaseValidateService.getErrorsSchemaRelease(release);

		if (errors.length > 0) {
			this.releaseLogService.failed({
				releaseId: id,
				step: 'Kiểm tra dữ liệu phát hành (Validation)',
				message: errors
					.map((e) => e?.message ?? 'Lỗi không xác định')
					.join(', '),
			});

			throw new ResponseError({
				message:
					'Release validation failed. Please check the input data.',
				data: errors,
			});
		}

		const errorsDsp = await this.processDsps({
			releaseId: id,
			codes: dto.code,
		});

		if (!errorsDsp || errorsDsp.length === 0) {
			await this.releaseRepo.update(id, {
				status: ReleaseStatus.DISTRIBUTED,
			});
		} else {
			await this.releaseRepo.update(id, {
				status: ReleaseStatus.ISSUES,
			});
		}

		return this.releaseQueryService.findOne(id);
	}

	private async processDsps({
		releaseId,
		codes,
	}: {
		releaseId: string;
		codes: string[];
	}) {
		const errors: string[] = [];

		// chỗ này bắt buộc phải xử lý từng thằng dsp chứ ko đc xử lý song song
		for (const code of codes) {
			try {
				switch (code) {
					case String(DspCode.SPOTIFY):
						await this.processSpotifyDsp(releaseId);
						break;

					case String(DspCode.FACEBOOK):
						await this.processFacebookDsp(releaseId);
						break;

					default: {
						const message = `DSP ${code} is not supported for release ${releaseId}`;

						errors.push(`${code}: ${message}`);
						this.logger.error(message);
						break;
					}
				}
			} catch (error) {
				const message =
					error?.message ||
					`DSP process failed for release ${releaseId}, code: ${code}`;

				errors.push(`${code}: ${message}`);
			}
		}

		return errors;
	}

	private async processSpotifyDsp(releaseId: string): Promise<void> {
		const dspSpotify = await this.dspRepo.findOne({
			where: { code: DspCode.SPOTIFY },
		});

		if (!dspSpotify) {
			this.releaseLogService.failed({
				releaseId,
				codeDsp: DspCode.SPOTIFY,
				message: 'Hệ thống chưa hỗ trợ hoặc thiếu cấu hình DSP Spotify',
				step: 'Ghi nhận DSP Spotify',
			});
			throw new ResponseError({ message: 'DSP SPOTIFY not found' });
		}

		await this.upsertReleaseDspDeliveryProcessing(releaseId, dspSpotify.id);

		try {
			//
			await this.createAndUploadMetadataSpotify(releaseId);

			await this.releaseDspDeliveryRepo.update(
				{ releaseId, dspId: dspSpotify.id },
				{
					status: ReleaseDspStatus.DISTRIBUTED,
					lastEnqueuedAt: new Date(),
					lastDeliveredAt: new Date(),
				},
			);

			this.releaseLogService.success({
				releaseId,
				step: 'Ghi nhận DSP Spotify',
				message: `Tạo dữ liệu và đóng gói gửi DSP Spotify thành công`,
				codeDsp: DspCode.SPOTIFY,
				dspId: 'SMImv6mH7H',
			});
		} catch (error) {
			await this.releaseDspDeliveryRepo.update(
				{ releaseId, dspId: dspSpotify.id },
				{
					status: ReleaseDspStatus.ISSUES,
					lastEnqueuedAt: new Date(),
					lastDeliveredAt: null,
				},
			);

			this.releaseLogService.failed({
				releaseId,
				step: 'Ghi nhận DSP Spotify',
				message: `Quá trình xử lý DSP Spotify thất bại: ${error?.message ?? 'Lỗi không xác định'}`,
				codeDsp: DspCode.SPOTIFY,
				dspId: 'SMImv6mH7H',
			});

			throw error;
		}
	}

	async processFacebookDsp(releaseId: string): Promise<void> {
		const dspFb = await this.dspRepo.findOne({
			where: { code: DspCode.FACEBOOK },
		});

		if (!dspFb) {
			this.releaseLogService.failed({
				releaseId,
				codeDsp: DspCode.FACEBOOK,
				message: 'Hệ thống chưa hỗ trợ hoặc thiếu cấu hình DSP Facebook',
				step: 'Ghi nhận DSP Facebook',
			});
			throw new ResponseError({ message: 'DSP FACEBOOK not found' });
		}

		await this.upsertReleaseDspDeliveryProcessing(releaseId, dspFb.id);

		try {
			//
			await this.releaseDdexCiService.createAndUploadMetadataDdexCi({
				releaseId,
				recipient: {
					name: dspFb.ddexName ?? '',
					partyId: dspFb.ddexId ?? '',
				},
			});

			await this.releaseDspDeliveryRepo.update(
				{ releaseId, dspId: dspFb.id },
				{
					status: ReleaseDspStatus.DISTRIBUTED,
					lastEnqueuedAt: new Date(),
					lastDeliveredAt: new Date(),
				},
			);

			this.releaseLogService.success({
				releaseId,
				step: 'Ghi nhận DSP Facebook',
				message: `Tạo dữ liệu và đóng gói gửi DSP Facebook thành công`,
				codeDsp: DspCode.FACEBOOK,
				dspId: 'HyTE8Isu5o',
			});
		} catch (error) {
			await this.releaseDspDeliveryRepo.update(
				{ releaseId, dspId: dspFb.id },
				{
					status: ReleaseDspStatus.ISSUES,
					lastEnqueuedAt: new Date(),
					lastDeliveredAt: null,
				},
			);

			this.releaseLogService.failed({
				releaseId,
				step: 'Ghi nhận DSP Facebook',
				message: `Quá trình xử lý DSP Facebook thất bại: ${error?.message ?? 'Lỗi không xác định'}`,
				codeDsp: DspCode.FACEBOOK,
				dspId: 'HyTE8Isu5o',
			});

			throw error;
		}
	}

	private async upsertReleaseDspDeliveryProcessing(
		releaseId: string,
		dspId: string,
	): Promise<void> {
		const existed = await this.releaseDspDeliveryRepo.findOne({
			where: {
				releaseId,
				dspId,
			},
		});

		if (!existed) {
			await this.releaseDspDeliveryRepo.save({
				releaseId,
				dspId,
				status: ReleaseDspStatus.PROCESSING,
				lastEnqueuedAt: new Date(),
				lastDeliveredAt: null,
				isSelected: true,
			});
			return;
		}

		await this.releaseDspDeliveryRepo.update(
			{ releaseId, dspId },
			{
				status: ReleaseDspStatus.PROCESSING,
				lastEnqueuedAt: new Date(),
				lastDeliveredAt: null,
				isSelected: true,
			},
		);
	}

	async parseMetadata(id: string) {
		return await this.releaseDdexCiService.parseMetadata(id);
	}

	// ci
	async createMetadataCiAndUploadToSftp(id: string) {
		return await this.releaseDdexCiService.createMetadataCiAndUploadToSftp(
			id,
		);
	}

	async createMetadataCiOnServer(id: string) {
		return await this.releaseDdexCiService.createMetadataFolderCiOnServer(
			id,
		);
	}

	async uploadMetadataCiToBucket({
		id,
		// localDir,
	}: {
		id: string;
		// localDir: string;
	}) {
		return await this.releaseDdexCiService.uploadMetadataFolderCiToBucket({
			// localDir,
			releaseId: id,
		});
	}

	async downloadMetadataCiFromBucket(releaseId: string) {
		return await this.releaseDdexCiService.downloadMetadataCiFromBucket(
			releaseId,
		);
	}

	async uploadMetadataCiToSftp(id: string) {
		return await this.releaseDdexCiService.uploadMetadataFolderCiToSftp(id);
	}

	async createMetadataCiAndUploadToBucket(id: string) {
		return await this.releaseDdexCiService.createMetadataFolderCiAndUploadToBucket(
			id,
		);
	}

	// spotify
	async createAndUploadMetadataSpotify(id: string) {
		await this.releaseDdexSpotifyService2.createMetadataSpotifyOnServer(id);
		await this.releaseDdexSpotifyService2.uploadMetadataSpotifyToSftp(id);
	}

	// test
	async createMetadataSpotifyOnServer(id: string) {
		const result =
			await this.releaseDdexSpotifyService2.createMetadataSpotifyOnServer(
				id,
			);

		return result;
	}

	async uploadMetadataSpotifyToSftp(id: string) {
		const result =
			await this.releaseDdexSpotifyService2.uploadMetadataSpotifyToSftp(
				id,
			);

		return result;
	}
}
