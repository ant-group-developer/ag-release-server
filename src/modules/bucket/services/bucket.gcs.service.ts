import { File, Storage } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResponseError } from 'src/common/dtos/common.response.dto';

import { BucketGcsAction } from '../enum/bucket.enum';
import {
	IGetSignedUrlDown,
	IGetSignedUrlRead,
	IGetSignedUrlUpload,
} from '../interfaces/bucket.interface';

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

	// data method
	getBaseUrlPublic() {
		return this.baseUrlPublic;
	}

	getBaseUrlPrivate() {
		return this.baseUrlPrivate;
	}

	getBucketName({ isPublic }: { isPublic: boolean }): string {
		return isPublic ? this.publicBucketName : this.privateBucketName;
	}

	// business logic
	async getSignedUrlUpload(data: IGetSignedUrlUpload): Promise<string> {
		const { contentType, key, isPublic = false } = data;

		const bucketName = this.getBucketName({ isPublic });

		const file = this.storage.bucket(bucketName).file(key);

		const [url] = await file.getSignedUrl({
			action: BucketGcsAction.WRITE,
			expires: Date.now() + 30 * 60 * 1000,
			contentType,
		});

		return url;
	}

	async getSignedUrlRead(data: IGetSignedUrlRead): Promise<string> {
		const { key, isPublic = false } = data;

		const bucketName = this.getBucketName({ isPublic });

		const file = this.storage.bucket(bucketName).file(key);

		const [url] = await file.getSignedUrl({
			action: BucketGcsAction.READ,
			expires: Date.now() + 4 * 3600 * 1000,
		});

		return url;
	}

	async getSignedUrlDown(data: IGetSignedUrlDown): Promise<string> {
		const { key, isPublic = false, fileName } = data;

		const bucketName = this.getBucketName({ isPublic });

		const file = this.storage.bucket(bucketName).file(key);

		const [url] = await file.getSignedUrl({
			action: BucketGcsAction.READ,
			expires: Date.now() + 4 * 3600 * 1000,
			responseDisposition: `attachment; filename=${fileName}`,
		});

		return url;
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

	// delete
	async deletePublicFile(key: string) {
		const file = await this.findOne({
			bucketName: this.publicBucketName,
			key,
		});
		await this.delete(file);
	}

	async deletePrivate(key: string) {
		const file = await this.findOne({
			bucketName: this.privateBucketName,
			key,
		});
		await this.delete(file);
	}

	private async delete(file: File) {
		const [exists] = await file.exists();
		if (!exists) return;

		await file.delete();
	}
}
