import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule } from '../bucket/bucket.module';
import { FileEntity } from '../bucket/entities/bucket.file.entity';
import { Track } from '../track/entities/track.entity';
import { AudioFileDraftController } from './controllers/audio-file.draft.controller';
import { AudioFile } from './entities/audio-file.entity';
import { AudioFileDraftService } from './services/audio-file.draft.service';
import { AudioFileQueryService } from './services/audio-file.query.service';
import { AudioFileValidateService } from './services/audio-file.validate.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([AudioFile, FileEntity, Track]),
		BucketModule,
	],
	controllers: [AudioFileDraftController],
	providers: [
		AudioFileDraftService,
		AudioFileValidateService,
		AudioFileQueryService,
	],
	exports: [AudioFileDraftService],
})
export class AudioFileModule {}
