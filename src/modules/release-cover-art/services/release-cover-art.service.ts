import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import sharp from 'sharp';
import { ResponseError } from 'src/common/dtos/response.dto';
import { UploadPurpose } from 'src/modules/bucket/enum/bucket.enum';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
import { ICoverArtThumbnails } from 'src/modules/release/interfaces/release.interface';
import { Repository } from 'typeorm';
import { CreateReleaseCoverArtDto } from '../dto/release-cover-art.dto';
import { ReleaseCoverArt } from '../entities/release-cover-art.entity';
import {
	ReleaseCoverArtSize,
	ValidFormatCoverArt,
} from '../enum/release-cover-art.enum';
import { ICreateReleaseCoverArt } from '../interface/release-cover-art.interface';
import { ReleaseCoverArtValidateService } from './release-cover-art.validate.service';

@Injectable()
export class ReleaseCoverArtService {
	constructor(
		@InjectRepository(ReleaseCoverArt)
		private readonly releaseCoverArtRepo: Repository<ReleaseCoverArt>,

		private readonly releaseCoverArtValidateService: ReleaseCoverArtValidateService,
		private readonly bucketService: BucketService,
	) {}

	async bulkCreate(
		data: ICreateReleaseCoverArt[],
	): Promise<ReleaseCoverArt[]> {
		const releaseCoverArt = this.releaseCoverArtRepo.create(data);
		return await this.releaseCoverArtRepo.save(releaseCoverArt);
	}

	// update
	async handleUpdateReleaseCoverArt({
		releaseId,
		releaseCoverArt,
	}: {
		releaseId: string;
		releaseCoverArt?: CreateReleaseCoverArtDto | null;
	}) {
		if (releaseCoverArt !== undefined) {
			// delete
			if (releaseCoverArt === null) {
				await this.deleteRecordOfRelease({
					releaseId,
				});
			}

			// update
			if (releaseCoverArt) {
				const { fileId } = releaseCoverArt;

				await this.releaseCoverArtValidateService.validate({ fileId });

				await this.deleteRecordOfRelease({ releaseId });

				//listArtOnBucket: Record<ReleaseCoverArtSize, fileId>;
				const listArtOnBucket = await this.genListCoverArtOnBucket(
					fileId,
					releaseId,
				);

				const releaseCoverArtEntities = this.getReleaseCoverArtEntities(
					{ listArtOnBucket, releaseId },
				);

				await this.bulkCreate(releaseCoverArtEntities);
			}
		}
	}

	private getReleaseCoverArtEntities({
		releaseId,
		listArtOnBucket,
	}: {
		releaseId: string;
		listArtOnBucket: Record<ReleaseCoverArtSize, string>;
	}) {
		const result: ICreateReleaseCoverArt[] = Object.entries(
			listArtOnBucket,
		).map(([size, fileId]) => {
			const [widthStr, heightStr] =
				size === 'original' ? ['1080', '1080'] : size.split('x');
			return {
				releaseId,
				fileId,
				width: Number(widthStr),
				height: Number(heightStr),
				type: size,
			};
		});

		return result;
	}

	private async genListCoverArtOnBucket(
		fileId: string,
		releaseId: string,
	): Promise<Record<ReleaseCoverArtSize, string>> {
		// 1. Lấy ảnh gốc dạng buffer
		const {
			fileBuffet: originalBuffer,
			fileDb: { fileName, contentType, extension },
		} = await this.bucketService.getFileBuffer(fileId);

		const extensionValidated = this.validateSharpFormat(extension);

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
				.toFormat(extensionValidated)
				.toBuffer();
			resizedBuffers[size] = buffer;
		}

		// 4. Lấy URL upload từ bucket
		const resCreateBuckets = await this.bucketService.bulkCreate({
			bucketDtos: resizeSizes.map((size) => ({
				// uploadPurpose: UploadPurpose.RELEASE_COVER_ART,
				folderBucket: this.bucketService.getFolderBucket({
					releaseId,
					uploadPurpose: UploadPurpose.RELEASE_COVER_ART,
				}),
				key: size,
				file: {
					fileName: `${fileName}_${size}.${extension}`,
					contentType,
					extension,
					fileSize: resizedBuffers[size].length,
				},
			})),
		});

		// 5. Upload từng ảnh lên GCS
		const result = {} as Record<ReleaseCoverArtSize, string>;

		for (const item of resCreateBuckets) {
			const buffer = resizedBuffers[item.key!];
			if (!buffer) continue;

			await axios.put(item.urlUpload, buffer, {
				headers: {
					'Content-Type': contentType,
				},
			});

			result[item.key as ReleaseCoverArtSize] = item.fileId;
		}

		// 6. Gán ảnh gốc vào key "original"
		result[ReleaseCoverArtSize.ORIGINAL] = fileId;

		return result;
	}

	private validateSharpFormat(format: string): ValidFormatCoverArt {
		const validFormat = Object.values(ValidFormatCoverArt) as string[];

		if (!validFormat.includes(format)) {
			throw new ResponseError({ message: `Invalid format: ${format}` });
		}

		return format as ValidFormatCoverArt;
	}

	// read
	async getCoverArtThumbnails(
		coverArts: ReleaseCoverArt[],
	): Promise<ICoverArtThumbnails> {
		const result: ICoverArtThumbnails = {
			'75x75': null,
			'100x100': null,
			'160x160': null,
			'300x300': null,
			'900x900': null,
			original: null,
		};

		for (const coverArt of coverArts) {
			if (
				[
					'75x75',
					'100x100',
					'160x160',
					'300x300',
					'900x900',
					'original',
				].includes(coverArt.type)
			) {
				result[coverArt.type as keyof ICoverArtThumbnails] =
					coverArt.fileId
						? await this.bucketService.getUrlRead(coverArt.fileId)
						: null;
			}
		}

		return result;
	}

	// delete
	async delete(id: string) {
		await this.releaseCoverArtRepo.delete(id);
	}

	async deleteRecordOfRelease({
		releaseId,
	}: {
		releaseId: string;
	}): Promise<void> {
		const releaseCoverArts = await this.releaseCoverArtRepo.find({
			where: { releaseId },
		});

		const fileIds = releaseCoverArts.map((item) => item.fileId);

		await this.releaseCoverArtRepo.delete({ releaseId });
		for (const fileId of fileIds) {
			await this.bucketService.delete(fileId);
		}
	}
}
