import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import archiver from 'archiver';
import axios from 'axios';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { BucketService2 } from 'src/modules/bucket2/services/bucket2.service';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { UpcService } from 'src/modules/external/upc/upc.service';
import { FileExportCiService } from 'src/modules/file-export-ci/file-export-ci.service';
import { ReleaseDspDelivery } from 'src/modules/release/entities/release-dsp-delivery.entity';
import { TrackService } from 'src/modules/track/services/track.service';
import { getCoverArtThumbnails } from 'src/utils/util';
import {
	getFileCsvFromRaw,
	getFileExcelFromRaw,
	getFileTxtFromRelease,
} from 'src/utils/util.file';
import { PassThrough } from 'stream';
import { Repository } from 'typeorm';
import {
	FileExportReleaseCiDto,
	QueryGetListReleaseDto,
	QueryGetListReleaseDto2,
	UpdateReleaseDto,
} from '../dto/release.dto';
import { SubmitReleaseDto } from '../dto/submit-release.dto';
import { Release } from '../entities/release.entity';
import { ReleaseStatus } from '../enum/release.enum';
import { IRelease, IReleaseDetail } from '../interfaces/release.interface';
import { ReleaseLog } from '../modules/release-log/entities/release-log.entity';
import { ReleaseLogService } from '../modules/release-log/services/release-log.service';
import { enhanceReleasesDetails } from '../utils/release.utils';
// import { ReleaseDdexCiService } from './release.ddex-ci.service';
// import { ReleaseSpotifyService2 } from './release.ddex-spotify2.service';
import { ExecutionType } from '../modules/release-executions/enum/release-execution.enum';
import { ReleaseExecutionsService } from '../modules/release-executions/services/release-executions.service';
import { ReleaseDspDeliveryService } from './release-dsp-services/release-dsp-delivery.service';
import { ReleaseQueryService } from './release.query.service';
import { ReleaseValidateService } from './release.validate.service';
import { CiService } from 'src/modules/partners-api/ci/services/ci.service';

@Injectable()
export class ReleaseService {
	private readonly logger = new Logger('ReleaseSpotifyService');
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		private readonly releaseLogService: ReleaseLogService,

		private readonly releaseValidateService: ReleaseValidateService,
		private readonly releaseQueryService: ReleaseQueryService,

		private readonly bucketService: BucketService2,

		private readonly upcService: UpcService,
		private readonly trackService: TrackService,
		private readonly appConfigService: AppConfigService,

		private readonly fileExportCiService: FileExportCiService,
		private readonly deliveryService: ReleaseDspDeliveryService,
		private readonly releaseExecutionsService: ReleaseExecutionsService,

		// partners api
		private readonly ciService: CiService,	
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

		await this.releaseRepo.update(id, {
			...data,
			isSentMetadataCi: false,
			modifierId: userId,
		});
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

	async genUpcById(releaseId: string) {
		// return 'test_upc'
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

		const res = await this.upcService.getUpc({ prefixUpcId });

		const newUpc = res.upc;
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

		return newUpc;
	}

	async genListIsrcByReleaseId(releaseId: string) {
		const release =
			await this.releaseQueryService.findOneWithRelation(releaseId);
		for (const track of release.tracks) {
			if (!track.isrc) {
				await this.trackService.genISRC(track.id);
			}
		}
	}

	async genListIsrc(release: Release) {
		for (const track of release.tracks) {
			if (!track.isrc) {
				await this.trackService.genISRC(track.id);
			}
		}
	}

	// nghiệp vụ
	async submit(id: string, userId: string, dto: SubmitReleaseDto) {
		await this.releaseQueryService.findOne(id);

		await this.releaseRepo.update(id, { status: ReleaseStatus.PROCESSING });

		this.releaseLogService.pending({
			releaseId: id,
			step: 'Bắt đầu xử lý phát hành',
			message: 'Bản phát hành đang được đưa vào hàng đợi xử lý',
		});

		this.processingSubmit({ id, userId, dto }).catch(async (error) => {
			await this.releaseRepo.update(id, {
				status: ReleaseStatus.FAILED,
			});

			this.releaseLogService.failed({
				releaseId: id,
				step: 'Lỗi phát hành',
				message: `Lỗi bất ngờ: ${error?.message ?? 'Không xác định'}`,
			});
		});

		return { message: 'Đang được xử lý' };
	}

	async submit2(id: string, userId: string, dto: SubmitReleaseDto) {
		await this.releaseQueryService.findOne(id);
		await this.releaseRepo.update(id, { status: ReleaseStatus.SUBMITTED, releaseEndDate: null });
		this.releaseExecutionsService
			.createAndProcess({
				releaseId: id,
				type: ExecutionType.INITIAL_RELEASE,
				originalDspCodes: dto.code,
				triggeredById: userId,
			})
			.catch((_e) => {
				this.logger.error(_e);
			});
	}

	async takedown(id: string, userId: string, dto: SubmitReleaseDto) {
		await this.releaseQueryService.findOne(id);
		await this.releaseRepo.update(id, {
			releaseEndDate: new Date(),
		});
		this.releaseExecutionsService
			.createAndProcess({
				releaseId: id,
				type: ExecutionType.TAKEDOWN,
				originalDspCodes: dto.code,
				triggeredById: userId,
			})
			.then(async () => {
				await this.releaseRepo.update(id, {
					status: ReleaseStatus.TAKEN_DOWN,
				});
			})
			.catch((_e) => {
				this.logger.error(_e);
			});
	}

	private async processingSubmit({
		id,
		userId,
		dto,
	}: {
		id: string;
		userId: string;
		dto: SubmitReleaseDto;
	}) {
		const release = await this.releaseQueryService.findOneWithRelation(id);

		// Gen UPC / ISRC if needed
		if (!release.upc) {
			await this.genUpcById(id);
		}

		await this.genListIsrc(release);

		// Validate
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

		// Distribute to all DSPs
		const dspErrors = await this.deliveryService.executeDistribution(
			id,
			dto.code,
		);

		if (!dspErrors || dspErrors.length === 0) {
			await this.releaseRepo.update(id, {
				status: ReleaseStatus.DISTRIBUTED,
			});
		} else {
			await this.releaseRepo.update(id, {
				status: ReleaseStatus.FAILED,
			});
		}
	}

	// get qa flag ci
	async getQaFlagCi(id: string) {
		const release = await this.releaseQueryService.findOne(id);
		const res = await this.ciService.getReleases({
			gtin: release.upc ? [release.upc] : [],
		});
		const idCi = res._embedded.find((item: any) => item.barcode === release.upc)?.id;
		const res2 = await this.ciService.getReleaseQaFlags(idCi);
		return res2._embedded;
	}

}
