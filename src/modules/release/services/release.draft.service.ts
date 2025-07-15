import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import sharp from 'sharp';
import { ResponseError } from 'src/common/dtos/response.dto';
import { UploadPurpose } from 'src/modules/bucket/enum/bucket.enum';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
import { CreateReleaseCoverArtDto } from 'src/modules/release-cover-art/dto/release-cover-art.dto';
import { ReleaseCoverArtSize } from 'src/modules/release-cover-art/enum/release-cover-art.enum';
import { ReleaseCoverArtService } from 'src/modules/release-cover-art/services/release-cover-art.service';
import { UpdateReleaseLanguageDraftDto } from 'src/modules/release-language/dto/release-language.draft.dto';
import { ReleaseLanguageDraftService } from 'src/modules/release-language/services/release-language.draft.service';
import { Repository } from 'typeorm';
import {
	CreateReleaseDraftDto,
	UpdateReleaseDraftDto,
} from '../dto/release.draft.dto';
import { Release } from '../entities/release.entity';
import { ReleaseStatus } from '../enum/release.enum';
import { IReleaseDraft } from '../interfaces/release.interface';
import { ReleaseQueryService } from './release.query.service';
import { ReleaseValidateService } from './release.validate.service';

@Injectable()
export class ReleaseDraftService {
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
		private readonly releaseValidateService: ReleaseValidateService,
		private readonly releaseQueryService: ReleaseQueryService,
		private readonly releaseCoverArtService: ReleaseCoverArtService,
		private readonly releaseLanguageDraftService: ReleaseLanguageDraftService,
		private readonly bucketService: BucketService,
	) {}

	async create(data: CreateReleaseDraftDto): Promise<IReleaseDraft> {
		const {
			// releaseCoverArt,
			...restOfData
		} = data;

		const { labelId, primaryGenreId, subGenreId, releaseTimezoneId } =
			restOfData;

		await this.releaseValidateService.validate({
			labelId,
			primaryGenreId,
			subGenreId,
			releaseTimezoneId,
		});

		const release = this.releaseRepo.create(restOfData);
		const result = await this.releaseRepo.save(release);

		// coverArt
		await this.createSubEntities(release.id);

		return this.releaseValidateService.ensureDraftRelease(result);
	}

	async update(
		id: string,
		data: UpdateReleaseDraftDto,
	): Promise<IReleaseDraft> {
		const { releaseCoverArt, releaseLanguage, ...restOfData } = data;
		const { labelId, primaryGenreId, subGenreId, releaseTimezoneId } =
			restOfData;

		const release = await this.releaseQueryService.findOne(id);

		if (release.status !== ReleaseStatus.DRAFT) {
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

		//
		await this.updateSubEntities({
			release,
			releaseLanguage,
			releaseCoverArt,
		});

		await this.releaseRepo.update(id, restOfData);
		const result = await this.releaseQueryService.getOneDetail(id);

		return this.releaseValidateService.ensureDraftRelease(result);
	}

	private async createSubEntities(releaseId: string) {
		await this.releaseCoverArtService.bulkCreate([
			{ releaseId, type: '75x75' },
			{ releaseId, type: '100x100' },
			{ releaseId, type: '160x160' },
			{ releaseId, type: '300x300' },
			{ releaseId, type: 'original' },
		]);

		await this.releaseLanguageDraftService.create({
			releaseId,
		});
	}

	private async updateSubEntities({
		release,
		releaseLanguage,
		releaseCoverArt,
	}: {
		release: Release;
		releaseLanguage?: UpdateReleaseLanguageDraftDto;
		releaseCoverArt?: CreateReleaseCoverArtDto | null;
	}) {
		if (releaseLanguage) {
			await this.releaseLanguageDraftService.update({
				id: release.releaseLanguage.id,
				dataUpdate: {
					metadataLanguageId: releaseLanguage.metadataLanguageId,
				},
			});
		}

		if (releaseCoverArt) {
			// const listCoverArts = await this.genListCoverArt(
			// 	releaseCoverArt.fileId,
			// );
			// const coverArtEntities: ICreateReleaseCoverArt[] = Object.entries(
			// 	listCoverArts,
			// ).map(([size, fileId]) => {
			// 	const [widthStr, heightStr] =
			// 		size === 'original' ? ['0', '0'] : size.split('x');
			// 	return {
			// 		releaseId: release.id,
			// 		fileId,
			// 		width: Number(widthStr),
			// 		height: Number(heightStr),
			// 		type: size,
			// 	};
			// });
			// await this.releaseCoverArtService.bulkCreate(coverArtEntities);
		}
	}

	private async genListCoverArt(
		fileId: string,
	): Promise<Record<ReleaseCoverArtSize, string>> {
		// 1. Lấy ảnh gốc dạng buffer
		const originalBuffer = await this.bucketService.getFileBuffer(fileId);

		// 2. Danh sách size cần xử lý (ngoại trừ 'original')
		const resizeSizes = [
			ReleaseCoverArtSize['75x75'],
			ReleaseCoverArtSize['100x100'],
			ReleaseCoverArtSize['160x160'],
			ReleaseCoverArtSize['300x300'],
			ReleaseCoverArtSize['900x900'],
		];

		// 3. Resize ảnh ra từng size
		const resizedBuffers: Record<string, Buffer> = {};
		for (const size of resizeSizes) {
			const [width, height] = size.split('x').map(Number);
			const buffer = await sharp(originalBuffer)
				.resize(width, height)
				.toFormat('jpeg')
				.toBuffer();
			resizedBuffers[size] = buffer;
		}

		// 4. Lấy URL upload từ bucket
		const listUrlUpload = await this.bucketService.bulkCreate({
			bucketDtos: resizeSizes.map((size) => ({
				uploadPurpose: UploadPurpose.RELEASE_COVER_ART,
				key: size,
				file: {
					fileName: `${fileId}_${size}.jpg`,
					contentType: 'image/jpeg',
					extension: 'jpg',
					fileSize: resizedBuffers[size].length,
				},
			})),
		});

		// 5. Upload từng ảnh lên GCS
		const result = {} as Record<ReleaseCoverArtSize, string>;

		for (const item of listUrlUpload) {
			const buffer = resizedBuffers[item.key!];
			if (!buffer) continue;

			await axios.put(item.urlUpload, buffer, {
				headers: {
					'Content-Type': 'image/jpeg',
				},
			});

			result[item.key as ReleaseCoverArtSize] = item.fileId;
		}

		// 6. Gán ảnh gốc vào key "original"
		result[ReleaseCoverArtSize.ORIGINAL] = fileId;

		return result;
	}
}
