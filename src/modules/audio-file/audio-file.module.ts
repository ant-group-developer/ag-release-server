import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Track } from '../track/entities/track.entity';
import { AudioFile } from './entities/audio-file.entity';

import { BucketModule2 } from '../bucket2/bucket2.module';
import { FileEntity } from '../bucket2/entities/bucket.file.entity';
import { AudioFileQueryService } from './services/audio-file.query.service';
import { AudioFileService } from './services/audio-file.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([AudioFile, FileEntity, Track]),
		BucketModule2,
	],

	providers: [AudioFileService, AudioFileQueryService],
	exports: [AudioFileService],
})
export class AudioFileModule {}
