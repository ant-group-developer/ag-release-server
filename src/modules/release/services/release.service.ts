import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import archiver from 'archiver';
import axios from 'axios';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
import { UpcService } from 'src/modules/external/upc/upc.service';
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

@Injectable()
export class ReleaseService {
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
	) {}

	// nghiệp vụ
	async submit(id: string, userId: string): Promise<IReleaseNonDraft> {
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

		await this.releaseRepo.save({ ...release, creatorId: userId });
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

		// -------- Map dữ liệu sang CreateUpc --------
		const prefixUpcId = 'ac694309-730e-4fa4-8269-4b834b9cb169';
		if (!prefixUpcId) {
			throw new BadRequestException('Release chưa có prefixUpcId');
		}

		const payload = {
			prefixUpcId,
			packagingLevel: 'Each',
			description: release.title,
			desc1Language: 'en',
			brandName: release.label?.name ?? '',
			brand1Language: 'en',
			status: 'ACTIVE',
			industry: 'MUSIC',
			isVariable: false,
			isPurchasable: true,
			isAdded: false,
			targetMarkets: ['VN'],
		};

		const res = await this.upcService.create(payload, 'token');

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

	// sportify
	async createAndUploadMetadataSpotify(id: string) {
		await this.createMetadataSpotifyOnServer(id);
		await this.uploadMetadataSpotifyToSftp(id);
	}

	async createMetadataSpotifyOnServer(id: string) {
		return await this.releaseDdexSpotifyService.createMetadataSpotifyOnServer(
			id,
		);
	}

	async uploadMetadataSpotifyToSftp(id: string) {
		return await this.releaseDdexSpotifyService.uploadMetadataSpotifyToSftp(
			id,
		);
	}
}
