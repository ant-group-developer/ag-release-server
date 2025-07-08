import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule } from '../bucket/bucket.module';
import { Genre } from '../genre/entities/genre.entity';
import { Release } from '../release/entities/release.entity';
import { TrackController } from './controllers/track.controller';
import { TrackDraftController } from './controllers/track.draft.controller';
import { Track } from './entities/track.entity';
import { TrackDraftService } from './services/track.draft.service';
import { TrackQueryService } from './services/track.query.service';
import { TrackService } from './services/track.service';
import { TrackValidateService } from './services/track.validate.service';

@Module({
	imports: [TypeOrmModule.forFeature([Track, Release, Genre]), BucketModule],
	controllers: [TrackController, TrackDraftController],
	providers: [
		TrackService,
		TrackDraftService,
		TrackValidateService,
		TrackQueryService,
	],
})
export class TrackModule {}
