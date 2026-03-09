import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import * as path from 'path';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { PublicRoute } from 'src/modules/auth/decorators/auth.decorator';
import {
	BulkCreateBucketDto,
	BulkSubmitDto,
	CreateBucketDto,
	GetUrlDownNonFile,
} from '../dto/bucket.dto';
import { GeneratePublicUploadUrlDto } from '../dto/bucket.gcs.dto';
import { BucketGcsService } from '../services/bucket.gcs.service';
import { BucketService } from '../services/bucket.service';

@ApiTags('GCS Upload')
@Controller('bucket/gcs')
export class BucketGcsController {
	constructor(
		private readonly bucketService: BucketService,

		private readonly bucketGcsService: BucketGcsService,
	) {}

	// create
	@Post('private')
	async create(@Body() data: CreateBucketDto) {
		const result = await this.bucketService.create(data);

		return new ResponseSuccess({
			data: result,
		});
	}

	@Post('private/template')
	async createTemplate(@Body() data: CreateBucketDto) {
		const result = await this.bucketService.createTemplate(data);

		return new ResponseSuccess({
			data: result,
		});
	}

	@PublicRoute()
	@Post('private/bulk')
	async bulkCreate(@Body() data: BulkCreateBucketDto) {
		const result = await this.bucketService.bulkCreate(data);

		return new ResponseSuccess({
			data: result,
		});
	}

	@Post('private/bulk/submit')
	async bulkSubmit(@Body() data: BulkSubmitDto) {
		const result = await this.bucketService.bulkSubmit(data);

		return new ResponseSuccess({
			data: result,
		});
	}

	@Post('private/:id/submit')
	async submit(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.bucketService.submit(id);

		return new ResponseSuccess({
			data: result,
		});
	}

	// read
	@PublicRoute()
	@Get('private/download-folder')
	async downloadFolder(@Query('prefix') prefix: string) {
		// Tạo tên thư mục duy nhất để tránh conflict
		const timestamp = Date.now();
		const destFolder = path.join(
			process.cwd(),
			'test_folder',
			`${prefix.replace(/\//g, '_')}_${timestamp}`,
		);

		const result = await this.bucketService.downloadFolder({
			prefix,
			destFolder,
			isPublic: false,
		});

		return new ResponseSuccess({
			data: result,
		});
	}
	@Get('private/download-template')
	async getUrlDownTemplateFile() {
		const result = await this.bucketService.getUrlDownTemplateFile();

		return new ResponseSuccess({
			data: result,
		});
	}
	@Get('private/:id/download')
	async getUrlDown(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.bucketService.getUrlDown(id);

		return new ResponseSuccess({
			data: result,
		});
	}

	@Get('private/:id/read')
	async getUrlRead(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.bucketService.getUrlRead(id);

		return new ResponseSuccess({
			data: result,
		});
	}

	@Get('private/:id')
	async getDetail(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.bucketService.getDetail(id);
		return new ResponseSuccess({
			data: result,
		});
	}

	// public: non file
	@Post('public/upload/presigned-url')
	async generatePublicPresignedUploadUrl(
		@Body() data: GeneratePublicUploadUrlDto,
	) {
		const result =
			await this.bucketService.generatePublicPresignedUploadUrl(data);

		return new ResponseSuccess({
			data: result,
		});
	}

	@Post('non-file/download')
	async getUrlDownNonFile(@Body() payload: GetUrlDownNonFile) {
		const data = await this.bucketService.getUrlDownNonFile(payload);

		return new ResponseSuccess({ data });
	}

	@Post('public/:urlPublic/delete')
	async deletePublic(@Param('urlPublic') urlPublic: string) {
		const decodedUrl = decodeURIComponent(urlPublic);
		return await this.bucketService.deletePublicFile(decodedUrl);
	}
}
