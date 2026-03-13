import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketR2Controller } from './controllers/bucket-r2.controller';
import { BucketGcsController } from './controllers/bucket.controller';
import { FileEntity } from './entities/bucket.file.entity';
import { ReleaseTemplateFile } from './entities/release-template-file.entity';
import { BucketFileService } from './services/bucket-file.service';
import { BucketGcsService } from './services/bucket-gcs.service';
import { BucketR2Service } from './services/bucket-r2.service';
import { BucketService } from './services/bucket.service';
@Module({
	imports: [TypeOrmModule.forFeature([FileEntity, ReleaseTemplateFile])],
	providers: [
		BucketService,
		BucketGcsService,
		BucketFileService,
		BucketR2Service,
	],
	controllers: [BucketGcsController, BucketR2Controller],
	exports: [BucketService],
})
export class BucketModule {}
