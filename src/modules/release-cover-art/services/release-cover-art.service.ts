import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import sharp from 'sharp';
import { ResponseError } from 'src/common/dtos/response.dto';
import { UploadPurpose } from 'src/modules/bucket/enum/bucket.enum';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
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
	private readonly logger = new Logger(ReleaseCoverArtService.name);

	constructor(
		@InjectRepository(ReleaseCoverArt)
		private readonly releaseCoverArtRepo: Repository<ReleaseCoverArt>,

		private readonly releaseCoverArtValidateService: ReleaseCoverArtValidateService,
		private readonly bucketService: BucketService,
	) {}

	async bulkCreate(data: ICreateReleaseCoverArt[]) {
		const releaseCoverArt = this.releaseCoverArtRepo.create(data);
		await this.releaseCoverArtRepo.save(releaseCoverArt);
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
				await this.deleteRecordOfReleaseSafe({
					releaseId,
				});
			}

			// update
			if (releaseCoverArt) {
				const { fileId: fileCoverArtOriginalId } = releaseCoverArt;

				await this.releaseCoverArtValidateService.validate({
					fileId: fileCoverArtOriginalId,
				});

				await this.deleteRecordOfReleaseSafe({ releaseId });

				await this.genArtOnBucketAndSaveToDb({
					fileCoverArtOriginalId,
					releaseId,
				});
			}
		}
	}

	private async genArtOnBucketAndSaveToDb({
		fileCoverArtOriginalId,
		releaseId,
	}: {
		fileCoverArtOriginalId: string;
		releaseId: string;
	}) {
		const listArtOnBucket = await this.genListCoverArtOnBucket(
			fileCoverArtOriginalId,
			releaseId,
		);

		const releaseCoverArtEntities = this.getReleaseCoverArtEntities({
			listArtOnBucket,
			releaseId,
		});

		await this.bulkCreate(releaseCoverArtEntities);
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
		// 1. Get original image as buffer
		const {
			fileBuffer: originalBuffer,
			fileDb: { fileName, contentType, extension },
		} = await this.bucketService.getFileBuffer(fileId);

		const extensionValidated = this.validateSharpFormat(extension);

		// 2. Define target sizes to generate (excluding 'original')
		const resizeSizes = [
			ReleaseCoverArtSize['75x75'],
			ReleaseCoverArtSize['100x100'],
			ReleaseCoverArtSize['160x160'],
			ReleaseCoverArtSize['300x300'],
		];

		// 3. Resize the original image to each target size
		const resizedBuffers: Record<string, Buffer> = {};

		await Promise.all(
			resizeSizes.map(async (size) => {
				const [width, height] = size.split('x').map(Number);
				const buffer = await sharp(originalBuffer)
					.resize(width, height)
					.toFormat(extensionValidated)
					.toBuffer();
				resizedBuffers[size] = buffer;
			}),
		);

		// 4. Generate upload URLs for resized images
		const resCreateBuckets = await this.bucketService.bulkCreate({
			bucketDtos: resizeSizes.map((size) => ({
				folderBucket: {
					releaseId,
					uploadPurpose: UploadPurpose.RELEASE_COVER_ART,
				},
				key: size,
				file: {
					fileName: `${fileName}_${size}.${extension}`,
					contentType,
					extension,
					fileSize: resizedBuffers[size].length,
				},
			})),
		});

		// 5. Upload resized images to the bucket
		const result = {} as Record<ReleaseCoverArtSize, string>;
		await Promise.all(
			resCreateBuckets.map(async (item) => {
				const buffer = resizedBuffers[item.key!];
				if (!buffer) return;

				await axios.put(item.urlUpload, buffer, {
					headers: {
						'Content-Type': contentType,
					},
				});

				await this.bucketService.submit(item.fileId);

				result[item.key as ReleaseCoverArtSize] = item.fileId;
			}),
		);

		// 6. Add original image with the 'original' key
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

	// delete
	async delete(id: string) {
		await this.releaseCoverArtRepo.delete(id);
	}

	async deleteSafe(id: string) {
		await this.delete(id).catch((e) =>
			this.logger.warn(`Skip delete, reason: ${e.message}`),
		);
	}

	async deleteRecordOfReleaseSafe({
		releaseId,
	}: {
		releaseId: string;
	}): Promise<void> {
		const releaseCoverArts = await this.releaseCoverArtRepo.find({
			where: { releaseId },
		});

		await Promise.all(
			releaseCoverArts.map((item) => this.deleteSafe(item.id)),
		);

		await Promise.all(
			releaseCoverArts.map((item) =>
				this.bucketService.deleteSafe(item.fileId),
			),
		);
	}
}
