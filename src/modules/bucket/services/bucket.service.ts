import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ResponseError } from 'src/common/dtos/response.dto';
import { generateFileNameWithTimestamp } from 'src/utils/date';
import {
	BulkCreateBucketDto,
	BulkSubmitDto,
	CreateBucketDto,
} from '../dto/bucket.dto';
import { GeneratePublicUploadUrlDto } from '../dto/bucket.gcs.dto';
import { IResCreateBucket } from '../interfaces/bucket.interface';
import { BucketFileService } from './bucket.file.service';
import { BucketGcsService } from './bucket.gcs.service';

@Injectable()
export class BucketService {
	constructor(
		private readonly bucketGcsService: BucketGcsService,
		private readonly bucketFileService: BucketFileService,
	) {}

	async create(data: CreateBucketDto): Promise<IResCreateBucket> {
		const { file, uploadPurpose, key: keyResult } = data;

		// create file
		const key = this.bucketGcsService.getKey({
			previousKey: this.bucketGcsService.getPreviousKey(uploadPurpose),
			fileName: generateFileNameWithTimestamp(file.fileName),
		});
		const bucket = this.bucketGcsService.getBucketName({ isPublic: false });

		const newFile = await this.bucketFileService.create({
			...file,
			key,
			bucket,
		});

		const urlUpload = await this.bucketGcsService.getSignedUrlUpload({
			contentType: newFile.contentType,
			key,
			isPublic: false,
		});

		return {
			fileId: newFile.id,
			urlUpload,
			key: keyResult,
		};
	}

	async bulkCreate(data: BulkCreateBucketDto): Promise<IResCreateBucket[]> {
		const result = [];

		for (const item of data.bucketDtos) {
			const newBucket = await this.create(item);
			result.push(newBucket);
		}

		return result;
	}

	async getUrlRead(id: string) {
		const file = await this.bucketFileService.findOne(id);
		const { key } = file;

		return this.bucketGcsService.getSignedUrlRead({
			key,
			isPublic: false,
		});
	}

	async getUrlDown(id: string) {
		const file = await this.bucketFileService.findOne(id);
		const { key, fileName } = file;

		return this.bucketGcsService.getSignedUrlDown({
			key,
			isPublic: false,
			fileName,
		});
	}

	async update({
		fileId,
		dataUpdate,
	}: {
		fileId: string;
		dataUpdate: { fileName: string };
	}) {
		await this.bucketFileService.update(fileId, {
			fileName: dataUpdate.fileName,
		});
	}

	async delete(id: string) {
		const fileDb = await this.bucketFileService.findOne(id);
		await this.bucketGcsService.delete({
			isPublic: false,
			key: fileDb.key,
		});

		await this.bucketFileService.delete(id);
	}

	//
	async submit(id: string) {
		const fileDb = await this.bucketFileService.findOne(id);
		const { bucket, key, isSubmitted } = fileDb;

		await this.bucketGcsService.findOne({
			bucketName: bucket,
			key,
		});

		if (isSubmitted) {
			throw new ResponseError({
				message: 'File is submitted',
			});
		}

		return await this.bucketFileService.submit(id);
	}

	async bulkSubmit(data: BulkSubmitDto) {
		const result = [];

		for (const id of data.ids) {
			result.push(await this.submit(id));
		}

		return result;
	}

	async getDetail(id: string) {
		const file = await this.bucketFileService.findOne(id);

		return {
			...file,
			urlPublic: this.bucketGcsService.getUrlPublic(file.key),
			urlPrivate: this.bucketGcsService.getUrlPrivate(file.key),
			urlRead: await this.bucketGcsService.getSignedUrlRead({
				key: file.key,
				isPublic: false,
			}),
		};
	}

	async getFileBuffer(fileId: string): Promise<Buffer> {
		const fileDb = await this.bucketFileService.findOne(fileId);

		const fileGcs = await this.bucketGcsService.findOne({
			bucketName: fileDb.bucket,
			key: fileDb.key,
		});

		const [contents] = await fileGcs.download();
		return contents;
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

		const key = this.bucketGcsService.getKey({
			previousKey: entityType,
			fileName,
		});

		const urlUpload = await this.bucketGcsService.getSignedUrlUpload({
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

	async testPeak(id: string) {
		const urlReadFile = await this.getUrlRead(id);

		try {
			const response = await axios.get(urlReadFile);
			return response.data as number[];
		} catch (error) {
			console.error('Error fetching data:', error);
			return {};
		}
	}
}
