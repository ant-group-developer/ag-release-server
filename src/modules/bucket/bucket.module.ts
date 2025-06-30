import { Module } from '@nestjs/common';
import { BucketGcsController } from './controllers/bucket.controller.gcs';
import { BucketGcsService } from './services/bucket.gcs.service';

@Module({
	providers: [BucketGcsService],
	controllers: [BucketGcsController],
	exports: [BucketGcsService],
})
export class BucketModule {}
