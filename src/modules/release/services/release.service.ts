import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import archiver from 'archiver';
import axios from 'axios';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { BucketService2 } from 'src/modules/bucket2/services/bucket2.service';
import { ErnVersion2 } from 'src/modules/ern2/interfaces/ern-input.interface';
import { UpcService } from 'src/modules/external/upc/upc.service';
import { FileExportCiService } from 'src/modules/file-export-ci/file-export-ci.service';
import { CiService } from 'src/modules/partners-api/ci/services/ci.service';
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
	BulkSubmitReleaseDto,
	FileExportReleaseCiDto,
	QueryGetListReleaseDto,
	QueryGetListReleaseDto2,
	UpdateReleaseDto,
} from '../dto/release.dto';
import { SubmitReleaseDto } from '../dto/submit-release.dto';
import { Release } from '../entities/release.entity';
import { ReleaseStatus } from '../enum/release.enum';
import { IRelease, IReleaseDetail } from '../interfaces/release.interface';
import { ReleaseExecution3Service } from '../modules/release-executions3/services/release-execution3.service';
import { ReleaseLogService } from '../modules/release-log/services/release-log.service';
import { ExecutionType } from '../modules/release-submit/entities/release-submit.entity';
import { ReleaseSubmitService2 } from '../modules/release-submit/services/release-submit2.service';
import { enhanceReleasesDetails } from '../utils/release.utils';
import { ReleaseDdexService } from './release-ddex.service';
import { ReleaseQueryService } from './release.query.service';
import { ReleaseValidateService } from './release.validate.service';

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

		// partners api
		private readonly ciService: CiService,

		@Inject(forwardRef(() => ReleaseSubmitService2))
		private readonly releaseSubmitService2: ReleaseSubmitService2,

		private readonly releaseDdexService: ReleaseDdexService,

		@Inject(forwardRef(() => ReleaseExecution3Service))
		private readonly releaseExecution3Service: ReleaseExecution3Service,
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
		const release = await this.releaseQueryService.findOneReleaseFull({
			releaseId: id,
		});

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
		const release = await this.releaseQueryService.findOneReleaseFull({
			releaseId: id,
			relations: ['release.releaseDspDeliveries'],
		});

		return release.listCodeExportCi;
	}

	async dataExportCiById(id: string) {
		const { listCodeExportCi, upc } =
			await this.releaseQueryService.findOneReleaseFull({
				releaseId: id,
				relations: ['release.releaseDspDeliveries'],
			});

		return {
			listCodeDspCi: listCodeExportCi,
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
		// return '0850080651803';
		const release = await this.releaseQueryService.getOneDetail(releaseId);

		// Nếu release đã có UPC
		if (release.upc) {
			return release.upc ?? '';
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

	async bulkSubmit(dto: BulkSubmitReleaseDto) {
		for (const id of dto.ids) {
			await this.submit(id, { code: dto.codes });
		}
	}

	async submit3(id: string, dto: SubmitReleaseDto) {
		const release = await this.releaseQueryService.findOneReleaseFull({
			releaseId: id,
		});
		await this.releaseRepo.update(id, {
			status: ReleaseStatus.SUBMITTED,
			releaseEndDate: null,
		});

		return this.releaseExecution3Service.newJob({
			release,
			dspCodes: dto.code,
			type: ExecutionType.INITIAL_RELEASE,
		});
	}

	async submit(id: string, dto: SubmitReleaseDto) {
		await this.releaseQueryService.findOne(id);
		await this.releaseRepo.update(id, {
			status: ReleaseStatus.SUBMITTED,
			releaseEndDate: null,
		});

		return this.releaseSubmitService2.submit({
			releaseId: id,
			dspCodes: dto.code,
			type: ExecutionType.INITIAL_RELEASE,
		});
	}

	async takedown(id: string, userId: string, dto: SubmitReleaseDto) {
		await this.releaseQueryService.findOne(id);
		await this.releaseRepo.update(id, {
			releaseEndDate: new Date(),
		});
		return this.releaseSubmitService2.submit({
			releaseId: id,
			dspCodes: dto.code,
			type: ExecutionType.TAKEDOWN,
		});
	}

	// get qa flag ci
	async getQaFlagCi(id: string) {
		// return []

		const release = await this.releaseQueryService.findOne(id);
		const resListReleaseCi = await this.ciService.getReleases({
			gtin: release.upc ? [release.upc] : [],
		});
		const idCi = resListReleaseCi._embedded.find(
			(item: any) => item.barcode === release.upc,
		)?.id;
		if (!idCi) {
			throw new ResponseError({ message: 'Không tìm thấy CI' });
		}
		const res2 = await this.ciService.getReleaseQaFlags(idCi);
		return res2._embedded;
	}

	/** Sync lại release status từ DSP deliveries */
	async syncReleaseStatus(releaseId: string) {
		await this.releaseQueryService.findOne(releaseId);
		const newStatus =
			await this.releaseSubmitService2.deriveAndUpdateReleaseStatus(
				releaseId,
			);
		return { releaseId, status: newStatus };
	}

	async getReleaseXml(id: string, code: string, ernVersion?: ErnVersion2) {
		const release = await this.releaseQueryService.findOneReleaseFull({
			releaseId: id,
		});

		return this.releaseDdexService.generateReleaseXml(
			release,
			code || 'spotify',
			ernVersion,
		);
	}
}
