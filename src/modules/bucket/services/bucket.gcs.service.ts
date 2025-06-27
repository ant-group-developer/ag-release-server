import { Storage } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetLinkUploadDto } from '../dto/bucket.gcs.dto';
import { BucketGcsAction } from '../enum/bucket.action.gsc';

@Injectable()
export class BucketGcsService {
	private storage: Storage;
	private bucketName: string;

	constructor(private readonly configService: ConfigService) {
		const keyFilePath = this.configService.get<string>('PATH_GCS_KEY');

		this.storage = new Storage({
			keyFilename: keyFilePath,
		});

		this.bucketName = 'ant-music-assets';
	}

	async getLinkUpload(data: GetLinkUploadDto): Promise<string> {
		const { folder, contentType, fileName } = data;

		const filePath = `${folder}/${fileName}`;

		const file = this.storage.bucket(this.bucketName).file(filePath);

		const [url] = await file.getSignedUrl({
			action: BucketGcsAction.write,
			expires: Date.now() + 100000000000,
			contentType,
		});

		return url;
	}
}
