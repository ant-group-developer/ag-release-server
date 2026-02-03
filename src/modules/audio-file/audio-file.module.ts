import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule } from '../bucket/bucket.module';
import { FileEntity } from '../bucket/entities/bucket.file.entity';
import { Track } from '../track/entities/track.entity';
import { AudioFile } from './entities/audio-file.entity';

import { AudioFileQueryService } from './services/audio-file.query.service';
import { AudioFileService } from './services/audio-file.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([AudioFile, FileEntity, Track]),
		BucketModule,
	],

	providers: [AudioFileService, AudioFileQueryService],
	exports: [AudioFileService],
})
export class AudioFileModule {}
