import { Body, Controller, Post } from '@nestjs/common';
import { GetLinkUploadDto } from '../dto/bucket.gcs.dto';
import { BucketGcsService } from '../services/bucket.gcs.service';

@Controller('bucket')
export class BucketGcsController {
	constructor(private readonly bucketGcsService: BucketGcsService) {}

	@Post()
	async getLinkUpload(@Body() data: GetLinkUploadDto) {
		return await this.bucketGcsService.getLinkUpload(data);
	}
}
