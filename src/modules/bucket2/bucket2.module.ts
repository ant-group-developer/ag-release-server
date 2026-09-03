import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketController2 } from './controllers/bucket.controller';
import { FileEntity } from './entities/bucket.file.entity';
import { FileMultipartUploadEntity } from './entities/file-multipart-upload.entity';
import { BucketFileService2 } from './services/bucket-file2.service';
import { BucketR2Service } from './services/bucket-r2.service';
import { BucketService2 } from './services/bucket2.service';
import { FileMultipartUploadService } from './services/file-multipart-upload.service';
@Module({
	imports: [
		TypeOrmModule.forFeature([FileEntity, FileMultipartUploadEntity]),
	],
	providers: [
		BucketService2,
		BucketFileService2,
		BucketR2Service,
		FileMultipartUploadService,
	],
	controllers: [BucketController2],
	exports: [BucketService2, BucketR2Service],
})
export class BucketModule2 {}
