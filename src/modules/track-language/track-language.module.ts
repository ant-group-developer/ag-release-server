import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Country } from '../country/entities/country.entity';
import { Language } from '../language/entities/language.entity';
import { Track } from '../track/entities/track.entity';
import { TrackLanguage } from './entities/track-language.entity';
import { TrackLanguageDraftService } from './services/track-language.draft.service';
import { TrackLanguageQueryService } from './services/track-language.query.service';
import { TrackLanguageValidateService } from './services/track-language.validate.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([TrackLanguage, Language, Track, Country]),
	],
	providers: [
		TrackLanguageDraftService,
		TrackLanguageQueryService,
		TrackLanguageValidateService,
	],
	exports: [TrackLanguageDraftService],
})
export class TrackLanguageModule {}
