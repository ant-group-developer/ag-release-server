import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import dayjs from 'dayjs';
import { ResponseError } from 'src/common/dtos/response.dto';
import { AppEvent } from 'src/common/enums/common';
import { generateFileNameWithTimestamp } from 'src/utils/util.date';
import { folderMap } from '../constants/bucket.constant';
import {
	BulkCreateBucketDto,
	BulkSubmitDto,
	CreateBucketDto,
} from '../dto/bucket.dto';
import { GeneratePublicUploadUrlDto } from '../dto/bucket.gcs.dto';
import { FileEntity } from '../entities/bucket.file.entity';
import { IResCreateBucket } from '../interfaces/bucket.interface';
import { BucketFileService } from './bucket.file.service';
import { BucketGcsService } from './bucket.gcs.service';

@Injectable()
export class BucketService {
	private readonly logger = new Logger(BucketService.name);

	constructor(
		private readonly bucketGcsService: BucketGcsService,
		private readonly bucketFileService: BucketFileService,
	) {}

	@OnEvent(AppEvent.DELETE_LOGO)
	handleDeleteLogo(urlPublic: string) {
		this.deletePublicFileSafe(urlPublic).catch((_e) => {});
	}

	// create
	async create(data: CreateBucketDto): Promise<IResCreateBucket> {
		const { file, folderBucket, key: keyForMapping } = data;

		// create file
		const fullKeyBucket = this.getFullKey({
			previousKey: this.getPreviousKey(folderBucket),
			fileName: generateFileNameWithTimestamp(file.fileName),
		});

		const bucket = this.bucketGcsService.getBucketName({ isPublic: false });

		const newFile = await this.bucketFileService.create({
			...file,
			key: fullKeyBucket,
			bucket,
		});

		const urlUpload = await this.bucketGcsService.getSignedUrlUpload({
			contentType: newFile.contentType,
			key: fullKeyBucket,
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

	// folder
	private getPreviousKey({
		uploadPurpose,
		releaseId,
		trackFileName,
	}: CreateBucketDto['folderBucket']) {
		const datePrefix = dayjs().format('YYYY_MM');
		const subFolder = folderMap[uploadPurpose];
		const trackSegment = trackFileName ? `/${trackFileName}` : '';
		return `releases/${datePrefix}/${releaseId}/${subFolder}${trackSegment}`;
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

	// read
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

	async getDetail(id: string) {
		const file = await this.bucketFileService.findOne(id);

		return {
			...file,
			urlPublic: this.getUrlPublic(file.key),
			urlPrivate: this.getUrlPrivate(file.key),
			urlRead: await this.bucketGcsService.getSignedUrlRead({
				key: file.key,
				isPublic: false,
			}),
		};
	}

	private getUrlPublic(key: string) {
		return `${this.bucketGcsService.getBaseUrlPublic()}/${key}`;
	}

	private getUrlPrivate(key: string) {
		return `${this.bucketGcsService.getBaseUrlPrivate()}/${key}`;
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
		await this.bucketGcsService.deletePrivate(fileDb.key);

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
			previousKey: entityType,
			fileName,
		});

		const urlUpload = await this.bucketGcsService.getSignedUrlUpload({
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

	async deletePublicFile(urlPublic: string): Promise<void> {
		const key = urlPublic.replace(
			this.bucketGcsService.getBaseUrlPublic() + '/',
			'',
		);
		await this.bucketGcsService.deletePublicFile(key);
	}

	async deletePublicFileSafe(urlPublic: string) {
		return await this.deletePublicFile(urlPublic).catch((error) => {
			const messageWarning = error?.response?.message;
			this.logger.error(messageWarning);
			return messageWarning ?? 'Unknown error';
		});
	}
}
