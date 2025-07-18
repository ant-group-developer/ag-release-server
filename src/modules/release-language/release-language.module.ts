import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Country } from '../country/entities/country.entity';
import { Language } from '../language/entities/language.entity';
import { Release } from '../release/entities/release.entity';
import { ReleaseLanguage } from './entities/release-language.entity';
import { ReleaseLanguageDraftService } from './services/release-language.draft.service';
import { ReleaseLanguageQueryService } from './services/release-language.query.service';
import { ReleaseLanguageValidateService } from './services/release-language.validate.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([ReleaseLanguage, Language, Release, Country]),
	],
	providers: [
		ReleaseLanguageDraftService,
		ReleaseLanguageValidateService,
		ReleaseLanguageQueryService,
	],
	exports: [ReleaseLanguageDraftService],
})
export class ReleaseLanguageModule {}
