import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import archiver from 'archiver';
import axios from 'axios';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import {
	CreateUpc,
	UpcIndustry,
	UpcLanguage,
	UpcPackagingLevel,
	UpcStatus,
	UpcYesNo,
} from 'src/modules/external/upc/upc.grpc.interface';
import { UpcService } from 'src/modules/external/upc/upc.service';
import { ReleaseDspDelivery } from 'src/modules/release-dsp/entities/release-dsp.entity';
import { ReleaseDspStatus } from 'src/modules/release-dsp/enum/release-dsp.enum';
import { ReleaseDdexSpotifyService } from 'src/modules/release/services/release.ddex-spotify.service';
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
	QueryGetListReleaseDto,
	QueryGetListReleaseDto2,
	UpdateReleaseDto,
} from '../dto/release.dto';
import { SubmitReleaseDto } from '../dto/submit-release.dto';
import { Release } from '../entities/release.entity';
import { ReleaseStatus } from '../enum/release.enum';
import {
	IRelease,
	IReleaseDetail,
	IReleaseNonDraft,
} from '../interfaces/release.interface';
import { ReleaseDdexCiService } from './release.ddex-ci.service';
import { ReleaseQueryService } from './release.query.service';
import { ReleaseValidateService } from './release.validate.service';
import { ReleaseQueryDspDeliveryDto } from '../dto/release-query-dsp-delivey.dto';
import { ReleaseDspDeliveryLogService } from 'src/modules/release-dsp-delivery-log/release-dsp-delivery-log.service';
import { ReleaseDspDeliveryLogLevel } from 'src/modules/release-dsp-delivery-log/enum/release-dsp-delivery-log.enum';

@Injectable()
export class ReleaseService {
	private readonly logger = new Logger('ReleaseSpotifyService');
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
		private readonly releaseValidateService: ReleaseValidateService,
		private readonly releaseQueryService: ReleaseQueryService,

		private readonly bucketService: BucketService,

		private readonly releaseDdexCiService: ReleaseDdexCiService,
		private readonly releaseDdexSpotifyService: ReleaseDdexSpotifyService,

		private readonly upcService: UpcService,
		private readonly trackService: TrackService,
		private readonly appConfigService: AppConfigService,

		@InjectRepository(ReleaseDspDelivery)
		private readonly releaseDspDeliveryRepo: Repository<ReleaseDspDelivery>,

		@InjectRepository(Dsp)
		private readonly dspRepo: Repository<Dsp>,
		private readonly releaseDspDeliveryLogService: ReleaseDspDeliveryLogService,
	) { }

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
			qb.andWhere('(dsp.name ILIKE :keyword OR dsp.code ILIKE :keyword)', {
				keyword: `%${keyword}%`,
			});
		}

		if (status) {
			qb.andWhere(
				'COALESCE(delivery.status, :defaultStatus) = :status',
				{
					status,
					defaultStatus: ReleaseDspStatus.NEVER_DISTRIBUTED,
				},
			);
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
	async submit(
		id: string,
		userId: string,
		dto: SubmitReleaseDto,
	): Promise<IReleaseNonDraft> {
		const release = await this.releaseQueryService.findOneWithRelation(id);
		release.status = ReleaseStatus.PROCESSING;

		if (!release.upc) {
			await this.genUpc(id);
		}

		for (const t of release.tracks) {
			if (!t.isrc) {
				await this.trackService.genISRC(t.id);
			}
		}

		// validate nonDraft
		const errors =
			this.releaseValidateService.getErrorsSchemaRelease(release);

		if (errors.length > 0) {
			throw new ResponseError({
				message:
					'Release validation failed. Please check the input data.',
				data: errors,
			});
		}

		const codeArray = dto.code;
		if (codeArray.includes('SPOTIFY')) {
			const dsp = await this.dspRepo.findOne({
				where: { code: 'SPOTIFY' },
			});
			if (!dsp) {
				throw new Error('DSP SPOTIFY not found');
			}

			const exist = await this.releaseDspDeliveryRepo.findOne({
				where: {
					releaseId: id,
					dspId: dsp.id,
				},
			});

			if (exist) {
				await this.releaseDspDeliveryRepo.update(
					{ releaseId: id, dspId: dsp.id },
					{
						status: ReleaseDspStatus.PROCESSING,
						lastEnqueuedAt: new Date(),
						lastDeliveredAt: null,
					},
				);
			} else {
				await this.releaseDspDeliveryRepo.save({
					releaseId: id,
					dspId: dsp.id,
					status: ReleaseDspStatus.PROCESSING,
					lastEnqueuedAt: new Date(),
					lastDeliveredAt: null,
				});
				await this.releaseRepo.update(id, {
					status: ReleaseStatus.PROCESSING,
				});
			}

			setImmediate(async () => {
				try {
					await this.createAndUploadMetadataSpotify(id);

					await this.releaseDspDeliveryRepo.update(
						{ releaseId: id, dspId: dsp?.id },
						{
							status: ReleaseDspStatus.DISTRIBUTED,
							lastEnqueuedAt: new Date(),
							lastDeliveredAt: new Date(),
						},
					);
				} catch (error) {
					await this.releaseDspDeliveryRepo.update(
						{ releaseId: id, dspId: dsp?.id },
						{
							status: ReleaseDspStatus.ISSUES,
							lastEnqueuedAt: new Date(),
						},
					);

					await this.releaseDspDeliveryLogService.create({
						releaseId: id,
						dspId: dsp.id,
						title: 'Spotify metadata processing failed',
						content: error?.message ?? 'Unknown error',
						level: ReleaseDspDeliveryLogLevel.ERROR,
						metadata: {
							stack: error?.stack,
							step: 'createAndUploadMetadataSpotify',
						},
					});

					this.logger.error(
						`Spotify metadata process failed for release ${id}`,
						error.stack,
					);
				}
			});
		}
		const result = await this.releaseQueryService.findOne(id);

		// convert to IReleaseNonDraft
		return this.releaseValidateService.ensureNonDraftRelease(result);
	}

	async getOne(id: string): Promise<IReleaseDetail> {
		const release = await this.releaseQueryService.getOneDetail(id);

		const { releaseCoverArts, ...restOfRelease } = release;

		const coverArtThumbnails = getCoverArtThumbnails(releaseCoverArts);

		return {
			...restOfRelease,
			coverArtThumbnails,
		};
	}

	async findOneFull(id: string): Promise<IReleaseDetail> {
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

		const enhancedRelease = this.enhanceReleasesDetails(releases);

		return new PageDto({
			items: enhancedRelease,
			metadata: {
				page,
				pageSize,
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

		const enhancedRelease = this.enhanceReleasesDetails(releases);

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

	private enhanceReleasesDetails(releases: Release[]) {
		return releases.map((release) => {
			const { releaseCoverArts, ...restOfRelease } = release;

			const coverArtThumbnails = getCoverArtThumbnails(releaseCoverArts);

			return {
				...restOfRelease,
				coverArtThumbnails,
			};
		});
	}

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

		archive.finalize().catch((_e) => { });

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
			throw new BadRequestException('Release chưa có prefixUpcId');
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
			throw new BadRequestException('Service UPC không trả về GTIN');
		}

		// -------- Update release --------
		await this.releaseRepo.update(releaseId, { upc: newUpc });

		return newUpc;
	}

	// distribution
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
		return await this.releaseDdexCiService.createMetadataCiOnServer(id);
	}

	async uploadMetadataCiToBucket({
		id,
		// localDir,
	}: {
		id: string;
		// localDir: string;
	}) {
		return await this.releaseDdexCiService.uploadMetadataCiToBucket({
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
		return await this.releaseDdexCiService.uploadMetadataCiToSftp(id);
	}

	async createMetadataCiAndUploadToBucket(id: string) {
		return await this.releaseDdexCiService.createMetadataCiAndUploadToBucket(
			id,
		);
	}

	// spotify
	async createAndUploadMetadataSpotify(id: string) {
		this.logger.log(
			`Start create & upload metadata Spotify - releaseId=${id}`,
		);

		await this.createMetadataSpotifyOnServer(id);

		this.logger.log(`Metadata created on server - releaseId=${id}`);

		await this.uploadMetadataSpotifyToSftp(id);

		this.logger.log(`Metadata uploaded to SFTP - releaseId=${id}`);

		this.logger.log(
			`Finish create & upload metadata Spotify - releaseId=${id}`,
		);
	}

	async createMetadataSpotifyOnServer(id: string) {
		this.logger.log(
			`Creating metadata Spotify on server - releaseId=${id}`,
		);

		const result =
			await this.releaseDdexSpotifyService.createMetadataSpotifyOnServer(
				id,
			);

		this.logger.log(
			`Created metadata Spotify successfully - releaseId=${id}`,
		);

		return result;
	}

	async uploadMetadataSpotifyToSftp(id: string) {
		this.logger.log(`Uploading metadata Spotify to SFTP - releaseId=${id}`);

		const result =
			await this.releaseDdexSpotifyService.uploadMetadataSpotifyToSftp(
				id,
			);

		this.logger.log(
			`Uploaded metadata Spotify successfully - releaseId=${id}`,
		);

		return result;
	}
}
