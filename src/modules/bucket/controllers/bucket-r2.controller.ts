import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import {
	IGetSignedUrlDown,
	IGetSignedUrlRead,
	IGetSignedUrlUpload,
} from '../interfaces/bucket.interface';
import { BucketR2Service } from '../services/bucket-r2.service';

@Controller('bucket/r2')
export class BucketR2Controller {
	constructor(private readonly bucketService: BucketR2Service) {}

	// upload signed url
	@Post('signed-url/upload')
	async getSignedUrlUpload(@Body() body: IGetSignedUrlUpload) {
		const url = await this.bucketService.getSignedUrlUpload(body);

		return {
			data: url,
		};
	}

	// read signed url
	@Post('signed-url/read')
	async getSignedUrlRead(@Body() body: IGetSignedUrlRead) {
		const url = await this.bucketService.getSignedUrlRead(body);

		return {
			data: url,
		};
	}

	// download signed url
	@Post('signed-url/download')
	async getSignedUrlDownload(@Body() body: IGetSignedUrlDown) {
		const url = await this.bucketService.getSignedUrlDown(body);

		return {
			data: url,
		};
	}

	// list files by prefix
	@Get('files')
	async getFiles(
		@Query('prefix') prefix: string,
		@Query('isPublic') isPublic?: boolean,
	) {
		const data = await this.bucketService.getFilesByPrefix({
			prefix,
			isPublic,
		});

		return {
			data,
		};
	}

	// delete public file
	@Delete('public')
	async deletePublic(@Query('key') key: string) {
		await this.bucketService.deletePublicFile(key);

		return {
			message: 'Public file deleted successfully',
		};
	}

	// delete private file
	@Delete('private')
	async deletePrivate(@Query('key') key: string) {
		await this.bucketService.deletePrivate(key);

		return {
			message: 'Private file deleted successfully',
		};
	}
}
