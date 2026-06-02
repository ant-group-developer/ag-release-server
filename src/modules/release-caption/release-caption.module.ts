import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule2 } from '../bucket2/bucket2.module';
import { FileEntity } from '../bucket2/entities/bucket.file.entity';
import { Language } from '../language/entities/language.entity';
import { Release } from '../release/entities/release.entity';
import { ReleaseCaption } from './entities/release-caption.entity';
import { ReleaseCaptionController } from './release-caption.controller';
import { ReleaseCaptionService } from './release-caption.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			ReleaseCaption,
			Release,
			FileEntity,
			Language,
		]),
		BucketModule2,
	],
	controllers: [ReleaseCaptionController],
	providers: [ReleaseCaptionService],
	exports: [ReleaseCaptionService],
})
export class ReleaseCaptionModule {}
