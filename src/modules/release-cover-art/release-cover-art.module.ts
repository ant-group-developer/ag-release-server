import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule2 } from '../bucket2/bucket2.module';
import { FileEntity } from '../bucket2/entities/bucket.file.entity';
import { Release } from '../release/entities/release.entity';
import { ReleaseCoverArt } from './entities/release-cover-art.entity';
import { ReleaseCoverArtService } from './services/release-cover-art.service';
import { ReleaseCoverArtValidateService } from './services/release-cover-art.validate.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([ReleaseCoverArt, Release, FileEntity]),
		BucketModule2,
	],
	providers: [ReleaseCoverArtService, ReleaseCoverArtValidateService],
	exports: [ReleaseCoverArtService],
})
export class ReleaseCoverArtModule {}
