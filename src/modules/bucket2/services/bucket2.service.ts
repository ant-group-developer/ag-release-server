import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import * as fs from 'fs';
import * as path from 'path';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { AppEvent } from 'src/common/enums/common';
import { generateFileNameWithTimestamp } from 'src/utils/util.date';
import { pipeline } from 'stream/promises';
import { FolderBucketMap } from '../constants/bucket.constant';
import {
	BulkCreateBucketDto,
	BulkSubmitDto,
	CreateBucketDto,
	GetUrlDownNonFile,
} from '../dto/bucket.dto';
import { GeneratePublicUploadUrlDto } from '../dto/bucket.r2.dto';
import { FileEntity } from '../entities/bucket.file.entity';
import { IResCreateBucket } from '../interfaces/bucket.interface';
import { BucketFileService2 } from './bucket-file2.service';
import { BucketR2Service } from './bucket-r2.service';

@Injectable()
export class BucketService2 {
	private readonly logger = new Logger(BucketService2.name);

	constructor(
		private readonly bucketR2Service: BucketR2Service,
		private readonly bucketFileService: BucketFileService2,
	) {}

	@OnEvent(AppEvent.DELETE_LOGO)
	handleDeleteLogo(urlPublic: string) {
		this.deletePublicFileSafe(urlPublic).catch((_e) => {});
	}

	// create
	async create(data: CreateBucketDto): Promise<IResCreateBucket> {
		const { file, folderBucket, key: keyForMapping } = data;

		const keyBucket =
			folderBucket.key ??
			this.getFullKey({
				previousKey: this.getPreviousKey(folderBucket),
				fileName: generateFileNameWithTimestamp(file.fileName),
			});

		const bucket = this.bucketR2Service.getBucketName({ isPublic: false });

		const newFile = await this.bucketFileService.create({
			...file,
			key: keyBucket,
			bucket,
		});

		const urlUpload = await this.bucketR2Service.getSignedUrlUpload({
			contentType: newFile.contentType,
			key: keyBucket,
			isPublic: false,
		});

		return {
			fileId: newFile.id,
			urlUpload,
			key: keyForMapping,
		};
	}

	async bulkCreate(data: BulkCreateBucketDto): Promise<IResCreateBucket[]> {
		return await Promise.all(
			data.bucketDtos.map((item) => this.create(item)),
		);
	}

	private getPreviousKey({
		uploadPurpose,
		releaseId,
		trackFileName,
	}: CreateBucketDto['folderBucket']) {
		const subFolder = FolderBucketMap[uploadPurpose];
		const trackSegment = trackFileName ? `/${trackFileName}` : '';

		return `releases/${releaseId}/${subFolder}${trackSegment}`;
	}

	private getFullKey({
		previousKey,
		fileName,
	}: {
		previousKey: string;
		fileName: string;
	}) {
		return `${previousKey}/${fileName}`;
	}

	async submit(id: string) {
		const fileDb = await this.bucketFileService.findOne(id);
		const { bucket, key, isSubmitted } = fileDb;

		await this.bucketR2Service.findOne({
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

	// read
	async getUrlRead(id: string) {
		const file = await this.bucketFileService.findOne(id);
		const { key } = file;

		return this.bucketR2Service.getSignedUrlRead({
			key,
			isPublic: false,
		});
	}

	async getUrlDown(id: string) {
		const file = await this.bucketFileService.findOne(id);
		const { key, fileName } = file;

		return this.bucketR2Service.getSignedUrlDown({
			key,
			isPublic: false,
			fileName,
		});
	}

	async getDetail(id: string) {
		const file = await this.bucketFileService.findOne(id);

		return {
			...file,
			urlPublic: this.getUrlPublic(file.key),
			urlPrivate: this.getUrlPrivate(file.key),
			urlRead: await this.bucketR2Service.getSignedUrlRead({
				key: file.key,
				isPublic: false,
			}),
		};
	}

	private getUrlPublic(key: string) {
		return `${this.bucketR2Service.getBaseUrlPublic()}/${key}`;
	}

	private getUrlPrivate(key: string) {
		return `${this.bucketR2Service.getBaseUrlPrivate()}/${key}`;
	}

	async getFileBuffer(fileId: string): Promise<{
		fileBuffer: Buffer;
		fileDb: FileEntity;
	}> {
		const fileDb = await this.bucketFileService.findOne(fileId);

		const fileBuffer = await this.bucketR2Service.getObjectBuffer({
			bucketName: fileDb.bucket,
			key: fileDb.key,
		});

		return {
			fileBuffer,
			fileDb,
		};
	}

	async getListFileBuffers(fileIds: string[]): Promise<
		{
			fileBuffer: Buffer;
			fileDb: FileEntity;
		}[]
	> {
		const listFileDb = await this.bucketFileService.getList(fileIds);

		if (!listFileDb.length) {
			return [];
		}

		const bucketName = listFileDb[0].bucket;

		const keys = listFileDb.map((fileDb) => fileDb.key);

		const listFileBufferByKeys = await this.getListFileBuffersByKeys(
			keys,
			bucketName,
		);

		const fileBufferMap = new Map(
			listFileBufferByKeys.map((item) => [item.key, item.fileBuffer]),
		);

		return listFileDb.map((fileDb) => {
			const fileBuffer = fileBufferMap.get(fileDb.key);

			if (!fileBuffer) {
				throw new Error(`File buffer not found for key: ${fileDb.key}`);
			}

			return {
				fileBuffer,
				fileDb,
			};
		});
	}

	async getListFileBuffersByKeys(
		keys: string[],
		bucketName: string,
	): Promise<
		{
			fileBuffer: Buffer;
			key: string;
		}[]
	> {
		const results: {
			fileBuffer: Buffer;
			key: string;
		}[] = [];

		for (const key of keys) {
			const fileBuffer = await this.bucketR2Service.getObjectBuffer({
				bucketName,
				key,
			});

			results.push({
				fileBuffer,
				key,
			});
		}

		return results;
	}

	async downloadFolder({
		prefix,
		destFolder,
		isPublic = false,
	}: {
		prefix: string;
		destFolder: string;
		isPublic?: boolean;
	}): Promise<{
		downloadedCount: number;
		failedCount: number;
		destFolder: string;
		errors: Array<{ key: string; error: string }>;
	}> {
		const filesDb = await this.bucketFileService.getFilesByPrefix({
			prefix,
		});

		const dbMap = new Map<string, FileEntity>();
		filesDb.forEach((f) => {
			dbMap.set(f.key, f);
		});

		const bucketName = this.bucketR2Service.getBucketName({ isPublic });

		const filesBucket = await this.bucketR2Service.getFilesByPrefix({
			prefix,
			isPublic,
		});

		await fs.promises.mkdir(destFolder, { recursive: true });

		let downloadedCount = 0;
		let failedCount = 0;
		const errors: Array<{ key: string; error: string }> = [];

		for (const { key } of filesBucket) {
			try {
				const fileDb = dbMap.get(key);
				if (!fileDb) {
					failedCount++;
					errors.push({ key, error: 'File not found in database' });
					continue;
				}

				let relativePath = key.startsWith(prefix)
					? key.substring(prefix.length)
					: key;

				if (relativePath.startsWith('/')) {
					relativePath = relativePath.substring(1);
				}

				if (fileDb.fileName) {
					const pathParts = relativePath.split('/');
					pathParts[pathParts.length - 1] = fileDb.fileName;
					relativePath = pathParts.join('/');
				}

				const fullPath = path.join(destFolder, relativePath);
				const dir = path.dirname(fullPath);

				await fs.promises.mkdir(dir, { recursive: true });

				const stream = await this.bucketR2Service.getObjectStream({
					bucketName,
					key,
				});

				const writeStream = fs.createWriteStream(fullPath);
				await pipeline(stream, writeStream);

				downloadedCount++;
			} catch (error) {
				failedCount++;
				errors.push({
					key,
					error:
						error instanceof Error
							? error.message
							: 'Unknown error',
				});
			}
		}

		return {
			downloadedCount,
			failedCount,
			destFolder,
			errors,
		};
	}

	// update
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

	// delete
	async delete(id: string) {
		const fileDb = await this.bucketFileService.findOne(id);
		await this.bucketR2Service.deletePrivate(fileDb.key);

		await this.bucketFileService.delete(id);
	}

	async deleteSafe(id: string) {
		await this.delete(id).catch((e) =>
			this.logger.warn(`Skip delete, reason: ${e.message}`),
		);
	}

	// public
	async generatePublicPresignedUploadUrl(
		data: GeneratePublicUploadUrlDto,
	): Promise<{
		urlPublic: string;
		urlUpload: string;
	}> {
		const { entityType, fileName, contentType } = data;

		const key = this.getFullKey({
			previousKey: FolderBucketMap[entityType],
			fileName,
		});

		const urlUpload = await this.bucketR2Service.getSignedUrlUpload({
			contentType,
			key,
			isPublic: true,
		});

		const urlPublic = this.getUrlPublic(key);

		return {
			urlPublic,
			urlUpload,
		};
	}

	async getUrlDownNonFile(payload: GetUrlDownNonFile) {
		const { url, isPublic, fileName } = payload;

		const baseUrl = isPublic
			? this.bucketR2Service.getBaseUrlPublic() + '/'
			: this.bucketR2Service.getBaseUrlPrivate() + '/';

		const key = url.replace(baseUrl, '');

		return await this.bucketR2Service.getSignedUrlDown({
			key,
			isPublic,
			fileName,
		});
	}

	async deletePublicFile(urlPublic: string) {
		const key = urlPublic.replace(
			this.bucketR2Service.getBaseUrlPublic() + '/',
			'',
		);

		return await this.bucketR2Service.getSignedUrlDown({
			fileName: 'backUp',
			key,
			isPublic: true,
		});
	}

	async deletePublicFileSafe(urlPublic: string) {
		return await this.deletePublicFile(urlPublic).catch((error) => {
			const messageWarning = error?.response?.message;
			this.logger.error(messageWarning);
			return messageWarning ?? 'Unknown error';
		});
	}
}
