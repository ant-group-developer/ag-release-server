import { Storage } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
	GenerateGcsPictureUploadUrlDto,
	GetUrlUploadDto,
} from '../dto/bucket.gcs.dto';
import { BucketGcsAction } from '../enum/bucket.action.gsc';

@Injectable()
export class BucketGcsService {
	private storage: Storage;
	private publicBucketName: string;
	private privateBucketName: string;
	private baseUrlPublic: string;

	constructor(private readonly configService: ConfigService) {
		const keyFilePath = this.configService.get<string>('PATH_GCS_KEY');

		this.storage = new Storage({ keyFilename: keyFilePath });
		this.publicBucketName =
			this.configService.get<string>('PUBLIC_BUCKET')!;
		this.privateBucketName =
			this.configService.get<string>('PROTECTED_BUCKET')!;
		this.baseUrlPublic = `https://storage.googleapis.com/${this.publicBucketName}/`;
	}

	async getUrlUploadPublicBucket(data: GetUrlUploadDto): Promise<string> {
		const { folder, contentType, fileName } = data;
		const filePath = `${folder}/${fileName}`;
		const file = this.storage.bucket(this.publicBucketName).file(filePath);

		const [url] = await file.getSignedUrl({
			action: BucketGcsAction.write,
			expires: Date.now() + 30 * 60 * 1000,
			contentType,
		});

		return url;
	}

	async deletePublicFile(urlPublic: string): Promise<void> {
		const file = this.storage
			.bucket(this.publicBucketName)
			.file(urlPublic.replace(this.baseUrlPublic, ''));

		const [exists] = await file.exists();
		if (!exists) return;

		await file.delete();
	}

	async generatePublicPictureUrl(
		data: GenerateGcsPictureUploadUrlDto,
	): Promise<{
		urlPublic: string;
		urlUpload: string;
	}> {
		const { entityType, fileName, contentType, fileSize } = data;

		const urlUpload = await this.getUrlUploadPublicBucket({
			contentType,
			fileName,
			fileSize,
			folder: entityType,
		});

		const urlPublic = this.getUrlPublic(entityType, fileName);

		return {
			urlPublic,
			urlUpload,
		};
	}

	private getUrlPublic(entityType: string, fileName: string) {
		return `${this.baseUrlPublic}${entityType}/${fileName}`;
	}
}
