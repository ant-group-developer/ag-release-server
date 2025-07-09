import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	BulkCreateBucketDto,
	BulkSubmitDto,
	CreateBucketDto,
	GeneratePublicUploadUrlDto,
} from '../dto/bucket.gcs.dto';
import { BucketService } from '../services/bucket.service';

@ApiTags('GCS Upload')
@Controller('bucket/gcs')
export class BucketGcsController {
	constructor(private readonly bucketService: BucketService) {}

	// file
	@Post('private')
	@ApiOperation({
		summary: 'Generate signed URL to upload a private picture to GCS',
	})
	@ApiResponse({
		status: 200,
		description: 'Successfully generated signed upload URL and public URL',
		schema: {
			example: new ResponseSuccess({
				data: {
					uploadUrl: 'https://storage.googleapis.com/...',
					fileId: 'fileId',
				},
			}),
		},
	})
	async create(@Body() data: CreateBucketDto) {
		const result = await this.bucketService.create(data);

		return new ResponseSuccess({
			data: result,
		});
	}

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

	@Get('private/:id/download')
	async getUrlDown(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.bucketService.getUrlDown(id);

		return new ResponseSuccess({
			data: result,
		});
	}

	@Get('private/:id/test-peak')
	async testPeak(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.bucketService.testPeak(id);

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

	// non file
	@Post('public/upload/presigned-url')
	@ApiOperation({
		summary: 'Generate signed URL to upload a public picture to GCS',
	})
	@ApiResponse({
		status: 200,
		description: 'Successfully generated signed upload URL and public URL',
		schema: {
			example: new ResponseSuccess({
				data: {
					uploadUrl: 'https://storage.googleapis.com/...',
					publicUrl: 'https://storage.googleapis.com/...',
				},
			}),
		},
	})
	async generatePublicPresignedUploadUrl(
		@Body() data: GeneratePublicUploadUrlDto,
	) {
		const result =
			await this.bucketService.generatePublicPresignedUploadUrl(data);

		return new ResponseSuccess({
			data: result,
		});
	}

	@Post('public/:urlPublic/delete')
	async deletePublic(@Param('urlPublic') urlPublic: string) {
		const decodedUrl = decodeURIComponent(urlPublic);
		return await this.bucketService.deletePublicFile(decodedUrl);
	}
}
