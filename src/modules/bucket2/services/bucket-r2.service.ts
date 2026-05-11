import {
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
		const { key, isPublic = false, fileName } = data;

		const bucketName = this.getBucketName({ isPublic });

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
}
