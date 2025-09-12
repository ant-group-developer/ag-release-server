import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlbumFormat } from '../album-format/entities/album-format.entity';
import { BucketModule } from '../bucket/bucket.module';
import { Genre } from '../genre/entities/genre.entity';
import { Label } from '../label/entities/label.entity';
import { ReleaseArtistModule } from '../release-artist/release-artist.module';
import { ReleaseCoverArt } from '../release-cover-art/entities/release-cover-art.entity';
import { ReleaseCoverArtModule } from '../release-cover-art/release-cover-art.module';
import { ReleaseLanguageModule } from '../release-language/release-language.module';
import { ReleaseTerritoryModule } from '../release-territory/release-territory.module';
import { Timezone } from '../timezone/entities/timezone.entity';
import { TrackModule } from '../track/track.module';
import { ReleaseController } from './controllers/release.controller';
import { ReleaseDraftController } from './controllers/release.draft.controller';
import { Release } from './entities/release.entity';
import { ReleaseDraftService } from './services/release.draft.service';
import { ReleaseQueryService } from './services/release.query.service';
import { ReleaseService } from './services/release.service';
import { ReleaseValidateService } from './services/release.validate.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			Release,
			AlbumFormat,
			Genre,
			Label,
			Timezone,
			ReleaseCoverArt,
		]),

		ReleaseLanguageModule,
		ReleaseCoverArtModule,
		ReleaseArtistModule,
		ReleaseTerritoryModule,

		TrackModule,
		BucketModule,
	],
	controllers: [ReleaseController, ReleaseDraftController],
	providers: [
		ReleaseService,
		ReleaseDraftService,
		ReleaseValidateService,
		ReleaseQueryService,
	],
})
export class ReleaseModule {}
