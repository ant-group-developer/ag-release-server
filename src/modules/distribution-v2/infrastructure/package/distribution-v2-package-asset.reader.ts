import { Injectable } from '@nestjs/common';
import { BucketService2 } from 'src/modules/bucket2/services/bucket2.service';
import { PackageAssetReader } from '../../application/ports/package-builder.port';

@Injectable()
export class DistributionV2PackageAssetReader implements PackageAssetReader {
	constructor(private readonly bucket: BucketService2) {}

	async read(fileId: string): Promise<{
		buffer: Buffer;
		fileName: string;
		extension: string;
		contentType: string;
		fileSize: number;
	}> {
		const { fileBuffer, fileDb } = await this.bucket.getFileBuffer(fileId);
		return {
			buffer: fileBuffer,
			fileName: fileDb.fileName,
			extension: fileDb.extension,
			contentType: fileDb.contentType,
			fileSize: Number(fileDb.fileSize),
		};
	}
}
