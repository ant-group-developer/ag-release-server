import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlbumFormat } from '../album-format/entities/album-format.entity';
import { AppConfigModule } from '../app-config/app-config.module';
import { BucketModule } from '../bucket/bucket.module';
import { Country } from '../country/entities/country.entity';
import { DDEXModule } from '../ddex';
import { DspRoutingConfigsModule } from '../distribution/dsp-routing/dsp-routing.module';
import { SftpConfigsModule } from '../distribution/sftp-configs/sftp-config.module';
import { SftpConnectModule } from '../distribution/sftp-connect/sftp-connect.module';
import { DspModule } from '../dsp/dsp.module';
import { Dsp } from '../dsp/entities/dsp.entity';
import { ErnModule } from '../ern/ern.module';
import { UpcModule } from '../external/upc/upc.module';
import { Genre } from '../genre/entities/genre.entity';
import { Label } from '../label/entities/label.entity';
import { OrmModule } from '../orm/orm.module';
import { ReleaseArtistModule } from '../release-artist/release-artist.module';
import { ReleaseCoverArtModule } from '../release-cover-art/release-cover-art.module';
import { ReleaseDspDeliveryLogModule } from '../release-dsp-delivery-log/release-dsp-delivery-log.module';
import { ReleaseDspDelivery } from '../release-dsp/entities/release-dsp.entity';
import { ReleaseLanguageModule } from '../release-language/release-language.module';
import { ReleaseTerritoryModule } from '../release-territory/release-territory.module';
import { Timezone } from '../timezone/entities/timezone.entity';
import { TrackModule } from '../track/track.module';
import { ReleaseController } from './controllers/release.controller';
import { ReleaseDraftController } from './controllers/release.draft.controller';
import { Release } from './entities/release.entity';
import { ReleaseDdexCiService } from './services/release.ddex-ci.service';
import { ReleaseDdexSpotifyService } from './services/release.ddex-spotify.service';
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
			Dsp,
			Country,
			ReleaseDspDelivery,
		]),

		AppConfigModule,

		ReleaseLanguageModule,
		ReleaseCoverArtModule,
		ReleaseArtistModule,
		ReleaseTerritoryModule,

		TrackModule,
		BucketModule,
		OrmModule,

		SftpConnectModule,
		SftpConfigsModule,
		UpcModule,
		DspModule,
		DDEXModule,
		ReleaseDspDeliveryLogModule,
		ErnModule,
		DspRoutingConfigsModule,
	],
	controllers: [ReleaseController, ReleaseDraftController],
	providers: [
		ReleaseService,
		ReleaseDraftService,
		ReleaseValidateService,
		ReleaseQueryService,

		ReleaseDdexCiService,
		ReleaseDdexSpotifyService,
	],
})
export class ReleaseModule {}
