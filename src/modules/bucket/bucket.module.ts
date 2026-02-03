import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketGcsController } from './controllers/bucket.controller';
import { FileEntity } from './entities/bucket.file.entity';
import { BucketFileService } from './services/bucket.file.service';
import { BucketGcsService } from './services/bucket.gcs.service';
import { BucketService } from './services/bucket.service';

@Module({
	imports: [TypeOrmModule.forFeature([FileEntity])],
	providers: [BucketService, BucketGcsService, BucketFileService],
	controllers: [BucketGcsController],
	exports: [BucketService],
})
export class BucketModule {}
