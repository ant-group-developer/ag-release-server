import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import sharp from 'sharp';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { UploadPurpose } from 'src/modules/bucket2/enum/bucket.enum';
import { BucketService2 } from 'src/modules/bucket2/services/bucket2.service';
import { EntityManager, Repository } from 'typeorm';
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
		private readonly bucketService2: BucketService2,
	) {}

	/**
	 * Lưu nhiều bản ghi cover art vào DB
	 * data: danh sách cover art đã được generate (original + resized)
	 */
	async bulkCreate({
		data,
		manager,
	}: {
		data: ICreateReleaseCoverArt[];
		manager?: EntityManager;
	}) {
		const repo = this.getRepo(manager);
		const releaseCoverArt = repo.create(data);
		return repo.save(releaseCoverArt);
	}

	async autoFillCoverArts({
		releaseId,
		manager,
	}: {
		releaseId: string;
		manager?: EntityManager;
	}) {
		const repo = this.getRepo(manager);
		const releaseCoverArts = await repo.find({
			where: { releaseId },
		});

		if (!releaseCoverArts.length) {
			throw new ResponseError({
				message: `Không tìm thấy cover art của release: ${releaseId}`,
			});
		}

		const originalCoverArt =
			releaseCoverArts.find(
				(item) =>
					(item.type as ReleaseCoverArtSize) ===
					ReleaseCoverArtSize.ORIGINAL,
			) ??
			releaseCoverArts.find(
				(item) => item.width === 1080 && item.height === 1080,
			);

		if (!originalCoverArt) {
			throw new ResponseError({
				message: `Không tìm thấy cover art gốc của release: ${releaseId}`,
			});
		}

		const existingTypes = new Set(
			releaseCoverArts.map((item) => item.type),
		);

		const missingSizes = [
			ReleaseCoverArtSize['75x75'],
			ReleaseCoverArtSize['100x100'],
			ReleaseCoverArtSize['160x160'],
			ReleaseCoverArtSize['300x300'],
		].filter((size) => !existingTypes.has(size));

		const entitiesToCreate: ICreateReleaseCoverArt[] = [];

		// nếu thiếu record original trong DB thì thêm lại
		if (!existingTypes.has(ReleaseCoverArtSize.ORIGINAL)) {
			entitiesToCreate.push({
				releaseId,
				fileId: originalCoverArt.fileId,
				width: 1080,
				height: 1080,
				type: ReleaseCoverArtSize.ORIGINAL,
			});
		}

		if (!missingSizes.length) {
			if (entitiesToCreate.length) {
				await this.bulkCreate({ data: entitiesToCreate, manager });
			}

			return {
				releaseId,
				created: entitiesToCreate.length,
				missingSizes: [],
			};
		}

		const {
			fileBuffer: originalBuffer,
			fileDb: { fileName, contentType, extension },
		} = await this.bucketService2.getFileBuffer(originalCoverArt.fileId);

		const extensionValidated = this.validateSharpFormat(extension);

		const resizedBuffers: Record<string, Buffer> = {};

		await Promise.all(
			missingSizes.map(async (size) => {
				const [width, height] = size.split('x').map(Number);

				const buffer = await sharp(originalBuffer)
					.resize(width, height)
					.toFormat(extensionValidated)
					.toBuffer();

				resizedBuffers[size] = buffer;
			}),
		);

		const resCreateBuckets = await this.bucketService2.bulkCreate({
			bucketDtos: missingSizes.map((size) => ({
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

		await Promise.all(
			resCreateBuckets.map(async (item) => {
				const buffer = resizedBuffers[item.key!];
				if (!buffer) return;

				await axios.put(item.urlUpload, buffer, {
					headers: {
						'Content-Type': contentType,
					},
				});

				await this.bucketService2.submit(item.fileId);

				const [width, height] = item.key!.split('x').map(Number);

				entitiesToCreate.push({
					releaseId,
					fileId: item.fileId,
					width,
					height,
					type: item.key as ReleaseCoverArtSize,
				});
			}),
		);

		if (entitiesToCreate.length) {
			await this.bulkCreate({ data: entitiesToCreate, manager });
		}

		return {
			releaseId,
			created: entitiesToCreate.length,
			missingSizes,
		};
	}

	/**
	 * Xử lý khi update cover art của release
	 *
	 * 3 case:
	 * 1. undefined  -> không làm gì
	 * 2. null       -> xoá cover art hiện tại
	 * 3. có data    -> validate file -> xoá cover art cũ -> generate cover art mới
	 */
	async handleUpdateReleaseCoverArt({
		releaseId,
		releaseCoverArt,
	}: {
		releaseId: string;
		releaseCoverArt?: CreateReleaseCoverArtDto | null;
	}) {
		if (releaseCoverArt !== undefined) {
			// delete cover art nếu truyền null
			if (releaseCoverArt === null) {
				await this.deleteRecordOfRelease({
					releaseId,
				});
			}

			// update cover art
			if (releaseCoverArt) {
				const { fileId: fileCoverArtOriginalId } = releaseCoverArt;

				// validate file ảnh
				await this.releaseCoverArtValidateService.validate({
					fileId: fileCoverArtOriginalId,
				});

				// xoá cover art cũ
				await this.deleteRecordOfRelease({ releaseId });

				// generate cover art mới (resize + upload + save DB)
				await this.generateCoverArts({
					fileCoverArtOriginalId,
					releaseId,
				});
			}
		}
	}

	/**
	 * Generate cover art trên bucket và lưu DB
	 *
	 * bước:
	 * 1. resize ảnh
	 * 2. upload lên bucket
	 * 3. lưu record vào DB
	 */
	private async generateCoverArts({
		fileCoverArtOriginalId,
		releaseId,
	}: {
		fileCoverArtOriginalId: string;
		releaseId: string;
	}) {
		const listArtOnBucket = await this.generateCoverArtsOnBucket(
			fileCoverArtOriginalId,
			releaseId,
		);

		const releaseCoverArtEntities = this.buildReleaseCoverArtEntities({
			listArtOnBucket,
			releaseId,
		});

		await this.bulkCreate({ data: releaseCoverArtEntities });
	}

	/**
	 * Public entry point for batch import to generate all cover art sizes.
	 * Reuses the internal resize pipeline but accepts an optional EntityManager
	 * for transaction safety during batch import.
	 *
	 * Flow:
	 * 1. Downloads original image from R2
	 * 2. Resizes to 75x75, 100x100, 160x160, 300x300 using sharp
	 * 3. Uploads resized images to R2
	 * 4. Saves all 5 ReleaseCoverArt records (original + 4 sizes)
	 */
	async generateCoverArtsForBatchImport({
		fileCoverArtOriginalId,
		releaseId,
		manager,
	}: {
		fileCoverArtOriginalId: string;
		releaseId: string;
		manager?: EntityManager;
	}) {
		const listArtOnBucket = await this.generateCoverArtsOnBucket(
			fileCoverArtOriginalId,
			releaseId,
		);

		const releaseCoverArtEntities = this.buildReleaseCoverArtEntities({
			listArtOnBucket,
			releaseId,
		});

		await this.bulkCreate({ data: releaseCoverArtEntities, manager });
	}

	/**
	 * Convert dữ liệu resize thành entity để lưu DB
	 *
	 * ví dụ:
	 * 75x75 -> width=75 height=75
	 * original -> width=1080 height=1080
	 */
	private buildReleaseCoverArtEntities({
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

	/**
	 * Generate các size cover art và upload lên bucket
	 *
	 * flow:
	 * 1. download ảnh gốc từ bucket
	 * 2. resize ảnh sang các size
	 * 3. tạo upload URL
	 * 4. upload ảnh resized
	 * 5. trả về map size -> fileId
	 */
	private async generateCoverArtsOnBucket(
		fileId: string,
		releaseId: string,
	): Promise<Record<ReleaseCoverArtSize, string>> {
		// lấy file ảnh gốc từ bucket
		const {
			fileBuffer: originalBuffer,
			fileDb: { fileName, contentType, extension },
		} = await this.bucketService2.getFileBuffer(fileId);

		// validate format ảnh
		const extensionValidated = this.validateSharpFormat(extension);

		// các size cần resize
		const resizeSizes = [
			ReleaseCoverArtSize['75x75'],
			ReleaseCoverArtSize['100x100'],
			ReleaseCoverArtSize['160x160'],
			ReleaseCoverArtSize['300x300'],
		];

		// buffer của các ảnh resized
		const resizedBuffers: Record<string, Buffer> = {};

		// resize ảnh bằng sharp
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

		// tạo upload url
		const resCreateBuckets = await this.bucketService2.bulkCreate({
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

		const result = {} as Record<ReleaseCoverArtSize, string>;

		// upload ảnh resized
		await Promise.all(
			resCreateBuckets.map(async (item) => {
				const buffer = resizedBuffers[item.key!];
				if (!buffer) return;

				await axios.put(item.urlUpload, buffer, {
					headers: {
						'Content-Type': contentType,
					},
				});

				// confirm upload
				await this.bucketService2.submit(item.fileId);

				result[item.key as ReleaseCoverArtSize] = item.fileId;
			}),
		);

		// thêm ảnh gốc
		result[ReleaseCoverArtSize.ORIGINAL] = fileId;

		return result;
	}

	/**
	 * Validate format ảnh trước khi resize
	 * chỉ cho phép các format được định nghĩa trong enum
	 */
	private validateSharpFormat(format: string): ValidFormatCoverArt {
		const validFormat = Object.values(ValidFormatCoverArt) as string[];

		if (!validFormat.includes(format)) {
			throw new ResponseError({ message: `Invalid format: ${format}` });
		}

		return format as ValidFormatCoverArt;
	}

	/**
	 * xoá 1 record cover art
	 */
	async delete(id: string) {
		await this.releaseCoverArtRepo.delete(id);
	}

	/**
	 * xoá toàn bộ cover art của 1 release
	 *
	 * flow:
	 * 1. lấy tất cả cover art của release
	 * 2. xoá record trong DB
	 * 3. xoá file trên bucket
	 */
	async deleteRecordOfRelease({
		releaseId,
	}: {
		releaseId: string;
	}): Promise<void> {
		const releaseCoverArts = await this.releaseCoverArtRepo.find({
			where: { releaseId },
		});

		await Promise.all(releaseCoverArts.map((item) => this.delete(item.id)));

		await Promise.all(
			releaseCoverArts.map((item) =>
				this.bucketService2.deleteSafe(item.fileId),
			),
		);
	}

	private getRepo(manager?: EntityManager) {
		return manager
			? manager.getRepository(ReleaseCoverArt)
			: this.releaseCoverArtRepo;
	}
}
