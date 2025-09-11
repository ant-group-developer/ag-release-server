import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '../app-config/app-config.module';
import { AudioFileModule } from '../audio-file/audio-file.module';
import { CopyrightModule } from '../copyright/copyright.module';
import { Genre } from '../genre/entities/genre.entity';
import { PriceTier } from '../price-tiers/entities/price-tier.entity';
import { Release } from '../release/entities/release.entity';
import { TrackArtistModule } from '../track-artist/track-artist.module';
import { TrackLanguageModule } from '../track-language/track-language.module';
import { TrackOriginType } from '../track-origin-type/entities/track-origin-type.entity';
import { TrackPolicyModule } from '../track-policy/track-policy.module';
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
		]),

		AudioFileModule,
		TrackLanguageModule,
		TrackArtistModule,
		CopyrightModule,
		TrackPolicyModule,
		AppConfigModule,
	],
	controllers: [TrackController, TrackDraftController],
	providers: [TrackService, TrackDraftService, TrackQueryService],
	exports: [TrackDraftService],
})
export class TrackModule {}
