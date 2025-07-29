import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AudioFileModule } from '../audio-file/audio-file.module';
import { BucketModule } from '../bucket/bucket.module';
import { Genre } from '../genre/entities/genre.entity';
import { Release } from '../release/entities/release.entity';
import { TrackArtistModule } from '../track-artist/track-artist.module';
import { TrackLanguageModule } from '../track-language/track-language.module';
import { TrackOriginType } from '../track-origin-type/entities/track-origin-type.entity';
import { TrackType } from '../track-type/entities/track-type.entity';
import { TrackController } from './controllers/track.controller';
import { TrackDraftController } from './controllers/track.draft.controller';
import { Track } from './entities/track.entity';
import { TrackReleaseService } from './services/track-release.service';
import { TrackDraftService } from './services/track.draft.service';
import { TrackQueryService } from './services/track.query.service';
import { TrackService } from './services/track.service';
import { TrackValidateService } from './services/track.validate.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			Track,
			Genre,
			Release,
			TrackType,
			TrackOriginType,
		]),
		BucketModule,
		AudioFileModule,
		TrackLanguageModule,
		TrackArtistModule,
	],
	controllers: [TrackController, TrackDraftController],
	providers: [
		TrackService,
		TrackDraftService,
		TrackValidateService,
		TrackQueryService,
		TrackReleaseService,
	],
	exports: [TrackDraftService],
})
export class TrackModule {}
