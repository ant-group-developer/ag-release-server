import {
	CopyObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { Readable } from 'stream';
import { BucketException } from '../constants/bucket.response';
import {
	IGetSignedUrlDown,
	IGetSignedUrlRead,
	IGetSignedUrlUpload,
} from '../interfaces/bucket.interface';

@Injectable()
export class BucketR2Service {
	private client: S3Client;
	private publicBucketName: string;
	private privateBucketName: string;
	private baseUrlPublic: string;
	private baseUrlPrivate: string;

	constructor(private readonly configService: ConfigService) {
		const R2_ENDPOINT = this.configService.get<string>('R2_ENDPOINT')!;
		const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID')!;
		const secretAccessKey = this.configService.get<string>(
			'R2_SECRET_ACCESS_KEY',
		)!;

		this.client = new S3Client({
			region: 'auto',
			endpoint: R2_ENDPOINT,
			credentials: { accessKeyId, secretAccessKey },
			requestChecksumCalculation: 'WHEN_REQUIRED',
			responseChecksumValidation: 'WHEN_REQUIRED',
		});

		this.publicBucketName =
			this.configService.get<string>('R2_PUBLIC_BUCKET')!;
		this.privateBucketName = this.configService.get<string>(
			'R2_PROTECTED_BUCKET',
		)!;

		this.baseUrlPublic =
			this.configService.get<string>('R2_PUBLIC_BASE_URL')!;
		this.baseUrlPrivate = this.configService.get<string>(
			'R2_PRIVATE_BASE_URL',
		)!;
	}

	// data methods
	getBaseUrlPublic() {
		return this.baseUrlPublic;
	}

	getBaseUrlPrivate() {
		return this.baseUrlPrivate;
	}

	getBucketName({ isPublic }: { isPublic: boolean }): string {
		return isPublic ? this.publicBucketName : this.privateBucketName;
	}

	async getSignedUrlUpload(data: IGetSignedUrlUpload): Promise<string> {
		const { key, isPublic = false, contentType } = data;

		if (!key) {
			throw new Error('Key is required');
		}

		const bucketName = this.getBucketName({ isPublic });

		const command = new PutObjectCommand({
			Bucket: bucketName,
			Key: key,
			ContentType: contentType,
		});

		return getSignedUrl(this.client, command, {
			expiresIn: 60 * 60,
		});
	}

	async uploadFileFromPath(data: {
		key: string;
		filePath: string;
		contentType: string;
		isPublic?: boolean;
	}): Promise<{ bucketName: string; key: string }> {
		const { key, filePath, contentType, isPublic = false } = data;
		const bucketName = this.getBucketName({ isPublic });
		const stat = await fs.promises.stat(filePath);

		await this.sendPutObjectWithRetry({
			bucketName,
			key,
			filePath,
			contentType,
			contentLength: stat.size,
		});

		return { bucketName, key };
	}

	private async sendPutObjectWithRetry(data: {
		bucketName: string;
		key: string;
		filePath: string;
		contentType: string;
		contentLength: number;
	}): Promise<void> {
		const maxAttempts = 3;
		let lastError: unknown;

		for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
			try {
				await this.client.send(
					new PutObjectCommand({
						Bucket: data.bucketName,
						Key: data.key,
						Body: fs.createReadStream(data.filePath),
						ContentType: data.contentType,
						ContentLength: data.contentLength,
					}),
				);
				return;
			} catch (error) {
				lastError = error;
				if (
					attempt >= maxAttempts ||
					!this.isRetryableUploadError(error)
				) {
					throw error;
				}
				await this.sleep(500 * attempt);
			}
		}

		throw lastError;
	}

	private isRetryableUploadError(error: unknown): boolean {
		const err = error as {
			code?: string;
			name?: string;
			message?: string;
			$metadata?: { httpStatusCode?: number };
		};
		const statusCode = err.$metadata?.httpStatusCode;
		const code = err.code || err.name;

		return (
			code === 'ECONNRESET' ||
			code === 'ETIMEDOUT' ||
			code === 'EPIPE' ||
			code === 'TimeoutError' ||
			code === 'RequestTimeout' ||
			code === 'SlowDown' ||
			(typeof statusCode === 'number' && statusCode >= 500)
		);
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async getSignedUrlRead(data: IGetSignedUrlRead): Promise<string> {
		const { key, isPublic = false, bucket } = data;

		const bucketName = bucket ?? this.getBucketName({ isPublic });

		const command = new GetObjectCommand({
			Bucket: bucketName,
			Key: key,
		});

		return getSignedUrl(this.client, command, { expiresIn: 4 * 3600 });
	}

	async getSignedUrlDown(data: IGetSignedUrlDown): Promise<string> {
		const { key, isPublic = false, fileName, bucket } = data;

		const bucketName = bucket ?? this.getBucketName({ isPublic });

		const command = new GetObjectCommand({
			Bucket: bucketName,
			Key: key,
			ResponseContentDisposition: `attachment; filename=${fileName}`,
		});

		return getSignedUrl(this.client, command, { expiresIn: 4 * 3600 });
	}

	async findOne({
		bucketName,
		key,
	}: {
		bucketName: string;
		key: string;
	}): Promise<{ bucketName: string; key: string }> {
		try {
			await this.client.send(
				new HeadObjectCommand({
					Bucket: bucketName,
					Key: key,
				}),
			);

			return { bucketName, key };
		} catch (error) {
			throw BucketException.FILE_NOT_FOUND_IN_STORAGE();
		}
	}

	async getObjectBuffer({
		bucketName,
		key,
	}: {
		bucketName: string;
		key: string;
	}): Promise<Buffer> {
		const result = await this.client.send(
			new GetObjectCommand({
				Bucket: bucketName,
				Key: key,
			}),
		);

		if (!result.Body) {
			throw new ResponseError({
				message: 'File not found on R2',
			});
		}

		const stream = result.Body as Readable;
		const chunks: Buffer[] = [];

		return new Promise((resolve, reject) => {
			stream.on('data', (chunk) =>
				chunks.push(
					Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
				),
			);
			stream.on('end', () => resolve(Buffer.concat(chunks)));
			stream.on('error', reject);
		});
	}

	async getObjectStream({
		bucketName,
		key,
	}: {
		bucketName: string;
		key: string;
	}): Promise<Readable> {
		const result = await this.client.send(
			new GetObjectCommand({
				Bucket: bucketName,
				Key: key,
			}),
		);

		if (!result.Body) {
			throw BucketException.FILE_NOT_FOUND_IN_STORAGE();
		}

		return result.Body as Readable;
	}

	async getFilesByPrefix({
		prefix,
		isPublic = false,
	}: {
		prefix: string;
		isPublic?: boolean;
	}) {
		const bucketName = this.getBucketName({ isPublic });

		const result = await this.client.send(
			new ListObjectsV2Command({
				Bucket: bucketName,
				Prefix: prefix,
			}),
		);

		const files = result.Contents || [];

		return files
			.filter((f) => f.Key && !f.Key.endsWith('/'))
			.map((f) => ({
				key: f.Key!,
				file: f, // metadata object (size, lastModified,...)
			}));
	}
	// delete
	async deletePublicFile(key: string) {
		await this.findOne({ bucketName: this.publicBucketName, key });
		await this.delete({ bucketName: this.publicBucketName, key });
	}

	async deletePrivate(key: string) {
		await this.findOne({ bucketName: this.privateBucketName, key });
		await this.delete({ bucketName: this.privateBucketName, key });
	}

	private async delete({
		bucketName,
		key,
	}: {
		bucketName: string;
		key: string;
	}) {
		await this.client.send(
			new DeleteObjectCommand({ Bucket: bucketName, Key: key }),
		);
	}

	async moveObject({
		bucketName,
		fromKey,
		toKey,
	}: {
		bucketName: string;
		fromKey: string;
		toKey: string;
	}): Promise<void> {
		await this.client.send(
			new CopyObjectCommand({
				Bucket: bucketName,
				CopySource: `${bucketName}/${encodeURIComponent(fromKey)}`,
				Key: toKey,
			}),
		);
		await this.delete({ bucketName, key: fromKey });
	}
}
