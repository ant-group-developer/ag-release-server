import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '../app-config/app-config.module';
import { AudioFileModule } from '../audio-file/audio-file.module';
import { CopyrightModule } from '../copyright/copyright.module';
import { IsrcModule } from '../external/isrc/isrc.module';
import { Genre } from '../genre/entities/genre.entity';
import { PriceTier } from '../price-tiers/entities/price-tier.entity';
import { Release } from '../release/entities/release.entity';
import { ReleaseLog } from '../release/modules/release-log/entities/release-log.entity';
import { ReleaseLogService } from '../release/modules/release-log/services/release-log.service';
import { TrackArtistModule } from '../track-artist/track-artist.module';
import { TrackContributorModule } from '../track-contributor/track-contributor.module';
import { TrackLanguageModule } from '../track-language/track-language.module';
import { TrackOriginType } from '../track-origin-type/entities/track-origin-type.entity';
import { TrackPolicyModule } from '../track-policy/track-policy.module';
import { TrackSensitive } from '../track-sensitive/entities/track-sensitive.entity';
import { TrackType } from '../track-type/entities/track-type.entity';
import { TrackController } from './controllers/track.controller';
import { TrackDraftController } from './controllers/track.draft.controller';
import { Track } from './entities/track.entity';
import { TrackDraftService } from './services/track.draft.service';
import { TrackQueryService } from './services/track.query.service';
import { TrackService } from './services/track.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			Track,
			Genre,
			Release,
			TrackType,
			TrackOriginType,
			PriceTier,
			TrackSensitive,
			ReleaseLog,
		]),

		AudioFileModule,
		TrackLanguageModule,
		TrackArtistModule,
		TrackContributorModule,
		CopyrightModule,
		TrackPolicyModule,
		AppConfigModule,

		IsrcModule,
	],
	controllers: [TrackController, TrackDraftController],
	providers: [
		TrackService,
		TrackDraftService,
		TrackQueryService,
		ReleaseLogService,
	],
	exports: [TrackDraftService, TrackService],
})
export class TrackModule {}
