import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import * as fs from 'fs';
import * as path from 'path';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { AppEvent } from 'src/common/enums/common';
import { UserReq } from 'src/common/interface/common.interface';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { MultipartUploadConfig } from 'src/modules/app-config/interfaces/app-config.type';
import { generateFileNameWithTimestamp } from 'src/utils/util.date';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { DataSource } from 'typeorm';
import { FolderBucketMap } from '../constants/bucket.constant';
import { BucketException } from '../constants/bucket.response';
import {
	BulkCreateBucketDto,
	BulkSubmitDto,
	CreateBucketDto,
	GetUrlDownNonFile,
} from '../dto/bucket.dto';
import {
	CompleteMultipartUploadDto,
	InitiateMultipartUploadDto,
	PresignMultipartPartDto,
	PresignMultipartPartsDto,
} from '../dto/bucket.multipart.dto';
import { GeneratePublicUploadUrlDto } from '../dto/bucket.r2.dto';
import { FileEntity } from '../entities/bucket.file.entity';
import { FileMultipartUploadEntity } from '../entities/file-multipart-upload.entity';
import { MultipartUploadStatus } from '../enum/bucket.enum';
import {
	IInitiateMultipartUploadResponse,
	IListUploadedPartsResponse,
	IMultipartUploadResult,
	IResCreateBucket,
} from '../interfaces/bucket.interface';
import { BucketFileService2 } from './bucket-file2.service';
import { BucketR2Service } from './bucket-r2.service';
import { FileMultipartUploadService } from './file-multipart-upload.service';

@Injectable()
export class BucketService2 {
	private readonly logger = new Logger(BucketService2.name);

	constructor(
		private readonly bucketR2Service: BucketR2Service,
		private readonly bucketFileService: BucketFileService2,
		private readonly appConfigService: AppConfigService,
		private readonly multipartService: FileMultipartUploadService,
		private readonly dataSource: DataSource,
	) {}

	@OnEvent(AppEvent.DELETE_LOGO)
	handleDeleteLogo(urlPublic: string) {
		this.deletePublicFileSafe(urlPublic).catch((_e) => {});
	}

	// helper
	private normalizeCompletedParts(
		parts: CompleteMultipartUploadDto['parts'],
		expectedPartCount: number,
	) {
		if (parts.length !== expectedPartCount) {
			throw BucketException.INVALID_MULTIPART_PARTS(
				`Expected ${expectedPartCount} parts, got ${parts.length}`,
			);
		}

		const sorted = parts
			.map((part) => ({
				PartNumber: part.partNumber,
				ETag: part.eTag.trim(),
			}))
			.sort((a, b) => a.PartNumber - b.PartNumber);

		for (let index = 0; index < sorted.length; index += 1) {
			const expected = index + 1;
			if (sorted[index].PartNumber !== expected) {
				throw BucketException.INVALID_MULTIPART_PARTS(
					`Missing or duplicate part: expected part ${expected}`,
				);
			}
			if (!sorted[index].ETag) {
				throw BucketException.INVALID_MULTIPART_PARTS(
					`ETag is required for part ${expected}`,
				);
			}
		}
		return sorted;
	}

	private async buildMultipartResult(
		file: FileEntity,
	): Promise<IMultipartUploadResult> {
		const [readUrl, downloadUrl] = await Promise.all([
			this.bucketR2Service.getSignedUrlRead({
				bucket: file.bucket,
				key: file.key,
			}),
			this.bucketR2Service.getSignedUrlDown({
				bucket: file.bucket,
				key: file.key,
				fileName: file.fileName,
			}),
		]);
		return {
			fileId: file.id,
			key: file.key,
			fileSize: Number(file.fileSize),
			contentType: file.contentType,
			readUrl,
			downloadUrl,
		};
	}

	private isNoSuchUpload(error: unknown): boolean {
		const typed = error as {
			name?: string;
			Code?: string;
			$metadata?: { httpStatusCode?: number };
		};
		return (
			typed.name === 'NoSuchUpload' ||
			typed.Code === 'NoSuchUpload' ||
			typed.$metadata?.httpStatusCode === 404
		);
	}

	private async assertStoredFileSize(file: FileEntity): Promise<void> {
		const head = await this.bucketR2Service.headObject({
			bucketName: file.bucket,
			key: file.key,
		});
		const expected = Number(file.fileSize);
		if (head.contentLength !== expected) {
			await this.bucketR2Service
				.deleteObject({ bucketName: file.bucket, key: file.key })
				.catch((error) =>
					this.logger.error(
						`Cannot delete invalid multipart object ${file.id}: ${error.message}`,
					),
				);
			throw BucketException.FILE_SIZE_MISMATCH(
				expected,
				head.contentLength,
			);
		}
	}

	private getMultipartConfig() {
		const config = this.appConfigService.getValue<MultipartUploadConfig>(
			'config.multipartUpload',
		);

		return {
			partSizeMb: config?.partSizeMb ?? 128,
			maxFileSizeMb: config?.maxFileSizeMb ?? 102400,
			expiresIn: config?.presignExpiresSeconds ?? 3600,
			sessionExpiresIn: config?.sessionExpiresSeconds ?? 86400,
		};
	}

	private calculateMultipartLayout(fileSize: number) {
		const { partSizeMb, maxFileSizeMb } = this.getMultipartConfig();
		const maxFileSize = maxFileSizeMb * 1024 * 1024;
		if (!Number.isSafeInteger(fileSize) || fileSize <= 0) {
			throw BucketException.INVALID_MULTIPART_PARTS(
				'fileSize must be a positive safe integer',
			);
		}
		if (fileSize > maxFileSize) {
			throw BucketException.INVALID_MULTIPART_PARTS(
				`Maximum multipart file size is ${maxFileSizeMb} MB`,
			);
		}

		const configured = partSizeMb * 1024 * 1024;
		const minimumForTenThousandParts = Math.ceil(fileSize / 10_000);
		const partSize = Math.max(
			configured,
			minimumForTenThousandParts,
			5 * 1024 * 1024,
		);
		const partCount = Math.ceil(fileSize / partSize);
		if (partCount < 1 || partCount > 10_000) {
			throw BucketException.INVALID_MULTIPART_PARTS(
				'partCount must be between 1 and 10000',
			);
		}
		return { partSize, partCount };
	}

	private async createFileMetadata(
		data: CreateBucketDto,
	): Promise<FileEntity> {
		const { file, folderBucket } = data;
		const key =
			folderBucket.key ??
			this.getFullKey({
				previousKey: this.getPreviousKey(folderBucket),
				fileName: generateFileNameWithTimestamp(file.fileName),
			});
		const bucket = this.bucketR2Service.getBucketName({ isPublic: false });

		return this.bucketFileService.create({
			...file,
			key,
			bucket,
		});
	}

	private assertMultipartOwner(
		session: FileMultipartUploadEntity,
		user: UserReq,
	): void {
		if (
			session.tenantId !== user.tenantId ||
			session.creatorId !== user.id
		) {
			throw BucketException.MULTIPART_FORBIDDEN();
		}
	}

	private assertSessionNotExpired(session: FileMultipartUploadEntity): void {
		if (session.expiresAt.getTime() <= Date.now()) {
			throw BucketException.MULTIPART_EXPIRED();
		}
	}

	// Multipart Upload
	async initiateMultipartUpload(
		dto: InitiateMultipartUploadDto,
		user: UserReq,
	): Promise<IInitiateMultipartUploadResponse> {
		const { partSize, partCount } = this.calculateMultipartLayout(
			dto.file.fileSize,
		);
		const { sessionExpiresIn } = this.getMultipartConfig();
		const file = await this.createFileMetadata(dto);

		let uploadId: string | undefined;
		try {
			const created = await this.bucketR2Service.createMultipartUpload({
				bucketName: file.bucket,
				key: file.key,
				contentType: file.contentType,
				metadata: { fileId: file.id },
			});
			uploadId = created.uploadId;
			const expiresAt = new Date(Date.now() + sessionExpiresIn * 1000);

			await this.multipartService.create({
				fileId: file.id,
				uploadId,
				tenantId: user.tenantId,
				creatorId: user.id,
				partSize,
				partCount,
				expiresAt,
			});

			return {
				fileId: file.id,
				key: file.key,
				partSize,
				partCount,
				expiresAt,
			};
		} catch (error) {
			if (uploadId) {
				await this.bucketR2Service
					.abortMultipartUpload({
						bucketName: file.bucket,
						key: file.key,
						uploadId,
					})
					.catch((abortError) =>
						this.logger.error(
							`Rollback abort failed for file ${file.id}: ${abortError.message}`,
						),
					);
			}
			await this.bucketFileService.delete(file.id).catch(() => undefined);
			throw error;
		}
	}

	async presignMultipartPart(
		fileId: string,
		dto: PresignMultipartPartDto,
		user: UserReq,
	) {
		const [file, session] = await Promise.all([
			this.bucketFileService.findOne(fileId),
			this.multipartService.findActiveByFileIdOrFail(fileId),
		]);
		this.assertMultipartOwner(session, user);
		this.assertSessionNotExpired(session);

		if (dto.partNumber > session.partCount) {
			throw BucketException.INVALID_MULTIPART_PARTS(
				`partNumber must be between 1 and ${session.partCount}`,
			);
		}

		const configuredTtl = this.getMultipartConfig().expiresIn;
		const remainingSeconds = Math.floor(
			(session.expiresAt.getTime() - Date.now()) / 1000,
		);
		const expiresIn = Math.min(configuredTtl, remainingSeconds);
		if (expiresIn <= 0) throw BucketException.MULTIPART_EXPIRED();

		const urlUpload = await this.bucketR2Service.getSignedUrlUploadPart({
			bucketName: file.bucket,
			key: file.key,
			uploadId: session.uploadId,
			partNumber: dto.partNumber,
			expiresIn,
		});

		return { partNumber: dto.partNumber, urlUpload, expiresIn };
	}

	async presignMultipartParts(
		fileId: string,
		dto: PresignMultipartPartsDto,
		user: UserReq,
	) {
		const [file, session] = await Promise.all([
			this.bucketFileService.findOne(fileId),
			this.multipartService.findActiveByFileIdOrFail(fileId),
		]);
		this.assertMultipartOwner(session, user);
		this.assertSessionNotExpired(session);

		const configuredTtl = this.getMultipartConfig().expiresIn;
		const remainingSeconds = Math.floor(
			(session.expiresAt.getTime() - Date.now()) / 1000,
		);
		const expiresIn = Math.min(configuredTtl, remainingSeconds);
		if (expiresIn <= 0) throw BucketException.MULTIPART_EXPIRED();

		const parts = await Promise.all(
			dto.partNumbers.map(async (partNumber) => {
				if (partNumber < 1 || partNumber > session.partCount) {
					throw BucketException.INVALID_MULTIPART_PARTS(
						'partNumber must be between 1 and ' + session.partCount,
					);
				}
				const urlUpload =
					await this.bucketR2Service.getSignedUrlUploadPart({
						bucketName: file.bucket,
						key: file.key,
						uploadId: session.uploadId,
						partNumber,
						expiresIn,
					});
				return { partNumber, urlUpload, expiresIn };
			}),
		);

		return { parts };
	}

	async listUploadedParts(
		fileId: string,
		user: UserReq,
	): Promise<IListUploadedPartsResponse> {
		const [file, session] = await Promise.all([
			this.bucketFileService.findOne(fileId),
			this.multipartService.findActiveByFileIdOrFail(fileId),
		]);
		this.assertMultipartOwner(session, user);
		this.assertSessionNotExpired(session);
		const parts = await this.bucketR2Service.listMultipartParts({
			bucketName: file.bucket,
			key: file.key,
			uploadId: session.uploadId,
		});
		return {
			fileId,
			partSize: Number(session.partSize),
			partCount: session.partCount,
			parts,
		};
	}

	async completeMultipartUpload(
		fileId: string,
		dto: CompleteMultipartUploadDto,
		user: UserReq,
	): Promise<IMultipartUploadResult> {
		const file = await this.bucketFileService.findOne(fileId);
		const current = await this.multipartService.findByFileIdOrFail(fileId);
		this.assertMultipartOwner(current, user);
		const parts = this.normalizeCompletedParts(
			dto.parts,
			current.partCount,
		);

		const decision = await this.dataSource.transaction(async (manager) => {
			const session = await this.multipartService.findByFileIdForUpdate(
				manager,
				fileId,
			);
			this.assertMultipartOwner(session, user);

			if (session.status === MultipartUploadStatus.COMPLETED) {
				return { alreadyCompleted: true, session };
			}
			if (session.status !== MultipartUploadStatus.INITIATED) {
				throw BucketException.MULTIPART_INVALID_STATE(session.status);
			}
			this.assertSessionNotExpired(session);
			await manager.update(FileMultipartUploadEntity, session.id, {
				status: MultipartUploadStatus.COMPLETING,
			});
			return { alreadyCompleted: false, session };
		});

		if (decision.alreadyCompleted) {
			await this.assertStoredFileSize(file);
			return this.buildMultipartResult(file);
		}

		try {
			await this.bucketR2Service.completeMultipartUpload({
				bucketName: file.bucket,
				key: file.key,
				uploadId: decision.session.uploadId,
				parts,
			});
		} catch (error) {
			if (!this.isNoSuchUpload(error)) {
				await this.multipartService.markStatus(
					decision.session.id,
					MultipartUploadStatus.INITIATED,
				);
				throw error;
			}
			const exists = await this.bucketR2Service.objectExists({
				bucketName: file.bucket,
				key: file.key,
			});
			if (!exists) {
				await this.multipartService.markStatus(
					decision.session.id,
					MultipartUploadStatus.FAILED,
					{ failureReason: 'R2 multipart upload no longer exists' },
				);
				throw error;
			}
		}

		try {
			await this.assertStoredFileSize(file);
		} catch (error) {
			await this.multipartService.markStatus(
				decision.session.id,
				MultipartUploadStatus.FAILED,
				{ failureReason: 'Completed object size mismatch' },
			);
			throw error;
		}

		await this.dataSource.transaction(async (manager) => {
			const session = await this.multipartService.findByFileIdForUpdate(
				manager,
				fileId,
			);
			if (session.status !== MultipartUploadStatus.COMPLETING) {
				throw BucketException.MULTIPART_INVALID_STATE(session.status);
			}
			await manager.update(FileMultipartUploadEntity, session.id, {
				status: MultipartUploadStatus.COMPLETED,
				completedAt: new Date(),
				failureReason: null,
			});
		});

		return this.buildMultipartResult(file);
	}

	async abortMultipartUpload(
		fileId: string,
		user: UserReq,
	): Promise<{ fileId: string; status: 'aborted' }> {
		const file = await this.bucketFileService.findOne(fileId);
		const decision = await this.dataSource.transaction(async (manager) => {
			const session = await this.multipartService.findByFileIdForUpdate(
				manager,
				fileId,
			);
			this.assertMultipartOwner(session, user);

			if (session.status === MultipartUploadStatus.ABORTED) {
				return { alreadyAborted: true, session };
			}
			if (
				session.status === MultipartUploadStatus.COMPLETED ||
				session.status === MultipartUploadStatus.COMPLETING ||
				session.status === MultipartUploadStatus.ABORTING
			) {
				throw BucketException.MULTIPART_INVALID_STATE(session.status);
			}
			await manager.update(FileMultipartUploadEntity, session.id, {
				status: MultipartUploadStatus.ABORTING,
			});
			return { alreadyAborted: false, session };
		});

		if (decision.alreadyAborted) {
			return { fileId, status: 'aborted' };
		}

		try {
			await this.bucketR2Service.abortMultipartUpload({
				bucketName: file.bucket,
				key: file.key,
				uploadId: decision.session.uploadId,
			});
		} catch (error) {
			if (!this.isNoSuchUpload(error)) {
				await this.multipartService.markStatus(
					decision.session.id,
					MultipartUploadStatus.FAILED,
					{ failureReason: 'R2 abort failed' },
				);
				throw error;
			}
			if (
				await this.bucketR2Service.objectExists({
					bucketName: file.bucket,
					key: file.key,
				})
			) {
				await this.multipartService.markStatus(
					decision.session.id,
					MultipartUploadStatus.COMPLETED,
					{ completedAt: new Date() },
				);
				throw BucketException.MULTIPART_INVALID_STATE(
					MultipartUploadStatus.COMPLETED,
				);
			}
		}

		await this.multipartService.markStatus(
			decision.session.id,
			MultipartUploadStatus.ABORTED,
			{ abortedAt: new Date(), failureReason: null },
		);
		return { fileId, status: 'aborted' };
	}

	// create
	async create(data: CreateBucketDto): Promise<IResCreateBucket> {
		const newFile = await this.createFileMetadata(data);
		const urlUpload = await this.bucketR2Service.getSignedUrlUpload({
			contentType: newFile.contentType,
			key: newFile.key,
			isPublic: false,
		});

		return {
			fileId: newFile.id,
			urlUpload,
			key: data.key,
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
		const { key, bucket } = await this.bucketFileService.findOne(id);

		return this.bucketR2Service.getSignedUrlRead({
			key,
			isPublic: false,
			bucket,
		});
	}

	async getUrlDown(id: string) {
		const file = await this.bucketFileService.findOne(id);
		const { key, fileName, bucket } = file;

		return this.bucketR2Service.getSignedUrlDown({
			key,
			fileName,
			bucket,
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
				bucket: file.bucket,
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
	): Promise<{ fileBuffer: Buffer; key: string }[]> {
		const BATCH_SIZE = 10;
		const results: { fileBuffer: Buffer; key: string }[] = [];

		for (let i = 0; i < keys.length; i += BATCH_SIZE) {
			const batch = keys.slice(i, i + BATCH_SIZE);
			const batchResults = await Promise.all(
				batch.map(async (key) => {
					const fileBuffer =
						await this.bucketR2Service.getObjectBuffer({
							bucketName,
							key,
						});
					return { fileBuffer, key };
				}),
			);
			results.push(...batchResults);
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

	async streamFileToPath({
		fileId,
		destPath,
		onProgress,
	}: {
		fileId: string;
		destPath: string;
		onProgress?: (percent: number) => void;
	}): Promise<FileEntity> {
		const fileDb = await this.bucketFileService.findOne(fileId);

		const stream = await this.bucketR2Service.getObjectStream({
			bucketName: fileDb.bucket,
			key: fileDb.key,
		});

		const writeStream = fs.createWriteStream(destPath);
		const totalBytes = Number(fileDb.fileSize) || 0;
		let downloadedBytes = 0;
		let lastReportedPercent = -1;

		const progressStream = new Transform({
			transform(chunk, _encoding, callback) {
				downloadedBytes += chunk.length;

				if (totalBytes > 0) {
					const percent = Math.min(
						100,
						Math.floor((downloadedBytes / totalBytes) * 100),
					);
					const reportPercent = Math.floor(percent / 5) * 5;

					if (reportPercent > lastReportedPercent) {
						lastReportedPercent = reportPercent;
						onProgress?.(reportPercent);
					}
				}

				callback(null, chunk);
			},
		});

		await pipeline(stream, progressStream, writeStream);

		if (lastReportedPercent < 100) {
			onProgress?.(100);
		}

		return fileDb;
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
