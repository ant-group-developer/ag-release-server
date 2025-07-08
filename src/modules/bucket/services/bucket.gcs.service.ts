import { File, Storage } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResponseError } from 'src/common/dtos/response.dto';
import {
	GetSignedUrlDownDto,
	GetSignedUrlReadDto,
	GetSignedUrlUploadDto,
} from '../dto/bucket.gcs.dto';
import { BucketGcsAction, UploadPurpose } from '../enum/bucket.enum';

@Injectable()
export class BucketGcsService {
	private storage: Storage;
	private publicBucketName: string;
	private privateBucketName: string;
	private baseUrlPublic: string;
	private baseUrlPrivate: string;

	constructor(private readonly configService: ConfigService) {
		const keyFilePath = this.configService.get<string>('PATH_GCS_KEY');

		this.storage = new Storage({ keyFilename: keyFilePath });
		this.publicBucketName =
			this.configService.get<string>('PUBLIC_BUCKET')!;
		this.privateBucketName =
			this.configService.get<string>('PROTECTED_BUCKET')!;
		this.baseUrlPublic = `https://storage.googleapis.com/${this.publicBucketName}`;
		this.baseUrlPrivate = `https://storage.cloud.google.com/${this.privateBucketName}`;
	}

	async getSignedUrlUpload(data: GetSignedUrlUploadDto): Promise<string> {
		const { contentType, key, isPublic } = data;

		const bucketName = this.getBucketName({ isPublic });

		const file = this.storage.bucket(bucketName).file(key);

		const [url] = await file.getSignedUrl({
			action: BucketGcsAction.WRITE,
			expires: Date.now() + 30 * 60 * 1000,
			contentType,
		});

		return url;
	}

	async getSignedUrlRead(data: GetSignedUrlReadDto): Promise<string> {
		const { key, isPublic } = data;

		const bucketName = this.getBucketName({ isPublic });

		const file = this.storage.bucket(bucketName).file(key);

		const [url] = await file.getSignedUrl({
			action: BucketGcsAction.READ,
			expires: Date.now() + 4 * 3600 * 1000,
		});

		return url;
	}

	async getSignedUrlDown(data: GetSignedUrlDownDto): Promise<string> {
		const { key, isPublic, fileName } = data;

		const bucketName = this.getBucketName({ isPublic });

		const file = this.storage.bucket(bucketName).file(key);

		const [url] = await file.getSignedUrl({
			action: BucketGcsAction.READ,
			expires: Date.now() + 4 * 3600 * 1000,
			responseDisposition: `attachment; filename=${fileName}`,
		});

		return url;
	}

	async delete({ isPublic, key }: { isPublic: boolean; key: string }) {
		const bucketName = this.getBucketName({ isPublic });

		const file = this.storage.bucket(bucketName).file(key);

		const [exists] = await file.exists();
		if (!exists) return;

		await file.delete();
	}

	//
	async findOne({
		bucketName,
		key,
	}: {
		bucketName: string;
		key: string;
	}): Promise<File> {
		const file = this.storage.bucket(bucketName).file(key);

		const [exists] = await file.exists();
		if (!exists)
			throw new ResponseError({
				message: 'File not found on Google Cloud Storage',
			});

		return file;
	}

	//
	getKey(previousKey: string, fileName: string) {
		return `${previousKey}/${fileName}`;
	}

	getPreviousKey(uploadPurpose: UploadPurpose) {
		switch (uploadPurpose) {
			case UploadPurpose.TRACK_AUDIO:
				return `tracks/audio`;
			case UploadPurpose.RELEASE_COVER_ART:
				return `release_cover_art`;

			default:
				return `unknown`;
		}
	}

	getUrlPublic(key: string) {
		return `${this.baseUrlPublic}/${key}`;
	}

	getUrlPrivate(key: string) {
		return `${this.baseUrlPrivate}/${key}`;
	}

	getBucketName({ isPublic }: { isPublic: boolean }): string {
		return isPublic ? this.publicBucketName : this.privateBucketName;
	}

	async deletePublicFile(urlPublic: string): Promise<void> {
		const key = urlPublic.replace(this.baseUrlPublic + '/', '');
		await this.delete({ isPublic: true, key });
	}
}
