import { Injectable } from '@nestjs/common';
import {
	CreateBucketDto,
	GeneratePublicUploadUrlDto,
} from '../dto/bucket.gcs.dto';
import { BucketFileService } from './bucket.file.service';
import { BucketGcsService } from './bucket.gcs.service';

@Injectable()
export class BucketService {
	constructor(
		private readonly bucketGcsService: BucketGcsService,
		private readonly bucketFileService: BucketFileService,
	) {}

	async create(data: CreateBucketDto): Promise<{
		fileId: string;
		urlUpload: string;
	}> {
		const { file, uploadPurpose } = data;

		// create file
		const previousKey = this.bucketGcsService.getPreviousKey(uploadPurpose);
		const key = this.bucketGcsService.getKey(previousKey, file.fileName);
		const bucket = this.bucketGcsService.getBucketName({ isPublic: false });

		const newFile = await this.bucketFileService.create({
			...file,
			key,
			bucket,
		});

		const urlUpload = await this.bucketGcsService.getUrlUpload({
			contentType: newFile.contentType,
			key,
			isPublic: false,
		});

		return {
			fileId: newFile.id,
			urlUpload,
		};
	}

	async submitFile(id: string) {
		const fileDb = await this.bucketFileService.findOne(id);
		await this.bucketGcsService.findOne({
			bucketName: fileDb.bucket,
			key: fileDb.key,
		});

		// if (fileDb.isSubmitted) {
		// 	throw new ResponseError({
		// 		message: 'File is submitted',
		// 	});
		// }

		return await this.bucketFileService.submitFile(id);
	}

	async getDetail(id: string) {
		const file = await this.bucketFileService.findOne(id);

		return {
			...file,
			urlPublic: this.bucketGcsService.getUrlPublic(file.key),
			urlPrivate: this.bucketGcsService.getUrlPrivate(file.key),
		};
	}

	async removeFile(id: string) {
		const fileDb = await this.bucketFileService.findOne(id);
		await this.bucketGcsService.delete({
			isPublic: false,
			key: fileDb.key,
		});

		await this.bucketFileService.delete(id);
	}

	// public
	async deletePublicFile(urlPublic: string): Promise<void> {
		await this.bucketGcsService.deletePublicFile(urlPublic);
	}

	async generatePublicPresignedUploadUrl(
		data: GeneratePublicUploadUrlDto,
	): Promise<{
		urlPublic: string;
		urlUpload: string;
	}> {
		const { entityType, fileName, contentType } = data;

		const key = this.bucketGcsService.getKey(entityType, fileName);

		const urlUpload = await this.bucketGcsService.getUrlUpload({
			contentType,
			key,
			isPublic: true,
		});

		const urlPublic = this.bucketGcsService.getUrlPublic(key);

		return {
			urlPublic,
			urlUpload,
		};
	}
}
