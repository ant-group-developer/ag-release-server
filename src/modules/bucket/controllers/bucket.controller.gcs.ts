import { Body, Controller, Post } from '@nestjs/common';
import { GenerateGcsPictureUploadUrlDto } from '../dto/bucket.gcs.dto';
import { BucketGcsService } from '../services/bucket.gcs.service';

@Controller('bucket/gcs')
export class BucketGcsController {
	constructor(private readonly bucketGcsService: BucketGcsService) {}

	@Post('public/upload/picture-url')
	async generatePublicPictureUrl(
		@Body() data: GenerateGcsPictureUploadUrlDto,
	) {
		return await this.bucketGcsService.generatePublicPictureUrl(data);
	}
}
