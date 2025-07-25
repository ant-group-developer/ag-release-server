import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { ResponseError } from 'src/common/dtos/response.dto';
import { generateFileNameWithTimestamp } from 'src/utils/date';
import { folderMap } from '../constants/bucket.constant';
import {
	BulkCreateBucketDto,
	BulkSubmitDto,
	CreateBucketDto,
} from '../dto/bucket.dto';
import { GeneratePublicUploadUrlDto } from '../dto/bucket.gcs.dto';
import { FileEntity } from '../entities/bucket.file.entity';
import { UploadPurpose } from '../enum/bucket.enum';
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
		const { file, folderBucket, key: keyResult } = data;

		// create file
		const key = this.bucketGcsService.getKey({
			previousKey: folderBucket,
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
		const result: IResCreateBucket[] = [];

		await Promise.all(
			data.bucketDtos.map(async (item) => {
				const newBucket = await this.create(item);
				result.push(newBucket);
			}),
		);

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
		const result: FileEntity[] = [];

		await Promise.all(
			data.ids.map(async (id) => {
				const data = await this.submit(id);
				result.push(data);
			}),
		);

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

	async getFileBuffer(fileId: string): Promise<{
		fileBuffer: Buffer;
		fileDb: FileEntity;
	}> {
		const fileDb = await this.bucketFileService.findOne(fileId);

		const fileGcs = await this.bucketGcsService.findOne({
			bucketName: fileDb.bucket,
			key: fileDb.key,
		});

		const [contents] = await fileGcs.download();
		return {
			fileBuffer: contents,
			fileDb,
		};
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

	// folder
	getFolderBucket({
		uploadPurpose,
		releaseId,
		trackName,
	}: {
		uploadPurpose: UploadPurpose;
		releaseId: string;
		trackName?: string;
	}) {
		const datePrefix = dayjs().format('YYYY_MM_DD');
		const subFolder = folderMap[uploadPurpose];
		const trackSegment = trackName ? `/${trackName}` : '';
		return `${datePrefix}/releases/${releaseId}/${subFolder}${trackSegment}`;
	}
}
