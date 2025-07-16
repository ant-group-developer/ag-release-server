import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule } from '../bucket/bucket.module';
import { Genre } from '../genre/entities/genre.entity';
import { Label } from '../label/entities/label.entity';
import { ReleaseArtistModule } from '../release-artist/release-artist.module';
import { ReleaseCoverArtModule } from '../release-cover-art/release-cover-art.module';
import { ReleaseLanguageModule } from '../release-language/release-language.module';
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
		TypeOrmModule.forFeature([Release, Genre, Label, Timezone]),
		// ReleaseCoverArtModule,
		BucketModule,
		ReleaseLanguageModule,
		ReleaseCoverArtModule,
		ReleaseArtistModule,
		TrackModule,
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
