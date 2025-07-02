import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import { GenerateGcsPresignedUploadUrlDto } from '../dto/bucket.gcs.dto';
import { BucketGcsService } from '../services/bucket.gcs.service';

@ApiTags('GCS Upload')
@Controller('bucket/gcs')
export class BucketGcsController {
	constructor(private readonly bucketGcsService: BucketGcsService) {}

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
		@Body() data: GenerateGcsPresignedUploadUrlDto,
	) {
		const result =
			await this.bucketGcsService.generatePublicPresignedUploadUrl(data);

		return new ResponseSuccess({
			data: result,
		});
	}

	// @Post('delete')
	// async generateUploadUrl() {
	// 	return await this.bucketGcsService.deletePublicFile(
	// 		'https://www.gravatar.com/avatar/b273b96e9e3f31b4b3a5de7cba2fb6e3',
	// 	);
	// }
}
