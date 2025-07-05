import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Genre } from '../genre/entities/genre.entity';
import { Release } from '../release/entities/release.entity';
import { TrackController } from './controllers/track.controller';
import { TrackDraftController } from './controllers/track.draft.controller';
import { Track } from './entities/track.entity';
import { TrackDraftService } from './services/track.draft.service';
import { TrackQbService } from './services/track.qb.service';
import { TrackService } from './services/track.service';
import { TrackValidateService } from './services/track.validate.service';

@Module({
	imports: [TypeOrmModule.forFeature([Track, Release, Genre])],
	controllers: [TrackController, TrackDraftController],
	providers: [
		TrackService,
		TrackDraftService,
		TrackValidateService,
		TrackQbService,
	],
})
export class TrackModule {}
