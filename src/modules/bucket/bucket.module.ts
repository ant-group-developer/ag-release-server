import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketGcsController } from './controllers/bucket.controller';
import { FileEntity } from './entities/bucket.file.entity';
import { BucketFileService } from './services/bucket.file.service';
import { BucketGcsService } from './services/bucket.gcs.service';
import { BucketService } from './services/bucket.service';
import { ReleaseTemplateFile } from './entities/release-template-file.entity'
@Module({
	imports: [TypeOrmModule.forFeature([FileEntity, ReleaseTemplateFile])],
	providers: [BucketService, BucketGcsService, BucketFileService],
	controllers: [BucketGcsController],
	exports: [BucketService],
})
export class BucketModule { }
