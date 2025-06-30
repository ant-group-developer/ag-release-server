import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GenerateGcsPictureUploadUrlDto } from '../dto/bucket.gcs.dto';
import { BucketGcsService } from '../services/bucket.gcs.service';

@ApiTags('GCS Upload')
@Controller('bucket/gcs')
export class BucketGcsController {
	constructor(private readonly bucketGcsService: BucketGcsService) {}

	@Post('public/upload/picture-url')
	@ApiOperation({
		summary: 'Generate signed URL to upload a public picture to GCS',
	})
	@ApiResponse({
		status: 200,
		description: 'Successfully generated signed upload URL and public URL',
		schema: {
			example: {
				uploadUrl: 'https://storage.googleapis.com/...',
				publicUrl: 'https://storage.googleapis.com/...',
			},
		},
	})
	async generatePublicPictureUrl(
		@Body() data: GenerateGcsPictureUploadUrlDto,
	) {
		return await this.bucketGcsService.generatePublicPictureUrl(data);
	}

	// @Post('delete')
	// async generateUploadUrl() {
	// 	return await this.bucketGcsService.deleteFile();
	// }
}
