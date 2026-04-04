import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlbumFormat } from '../album-format/entities/album-format.entity';
import { AppConfigModule } from '../app-config/app-config.module';
import { BucketModule2 } from '../bucket2/bucket2.module';
import { CountryModule } from '../country/country.module';
import { Country } from '../country/entities/country.entity';
import { AggregatorsModule } from '../distribution/aggregator/aggregator.module';
import { DspRoutingConfigsModule } from '../distribution/dsp-routing/dsp-routing.module';
import { SftpConfigsModule } from '../distribution/sftp-configs/sftp-config.module';
import { SftpConnectModule } from '../distribution/sftp-connect/sftp-connect.module';
import { DspModule } from '../dsp/dsp.module';
import { Dsp } from '../dsp/entities/dsp.entity';
import { PriceTier } from '../price-tiers/entities/price-tier.entity';
import { ErnModule } from '../ern/ern.module';
import { UpcModule } from '../external/upc/upc.module';
import { FileExportCiModule } from '../file-export-ci/file-export-ci.module';
import { Genre } from '../genre/entities/genre.entity';
import { Label } from '../label/entities/label.entity';
import { OrmModule } from '../orm/orm.module';
import { ReleaseArtistModule } from '../release-artist/release-artist.module';
import { ReleaseCoverArtModule } from '../release-cover-art/release-cover-art.module';
import { ReleaseDspDelivery } from './entities/release-dsp-delivery.entity';
import { ReleaseLanguageModule } from '../release-language/release-language.module';
import { ReleaseTerritoryModule } from '../release-territory/release-territory.module';
import { Timezone } from '../timezone/entities/timezone.entity';
import { TrackModule } from '../track/track.module';
import { ReleaseController } from './controllers/release.controller';
import { ReleaseDraftController } from './controllers/release.draft.controller';
import { Release } from './entities/release.entity';
import { ReleaseDdexService } from './services/release-ddex.service';
import { ReleaseLog } from './modules/release-log/entities/release-log.entity';
import { ReleaseLogModule } from './modules/release-log/release-log.module';
// import { ReleaseDdexCiService } from './services/release.ddex-ci.service';
// import { ReleaseSpotifyService2 } from './services/release.ddex-spotify2.service';
import { ReleaseDraftService } from './services/release.draft.service';
import { ReleaseQueryService } from './services/release.query.service';
import { ReleaseService } from './services/release.service';
import { ReleaseValidateService } from './services/release.validate.service';
import { ReleaseDspDeliveryService } from './services/release-dsp-services/release-dsp-delivery.service';
import { ReleaseDspDeliveryQueryService } from './services/release-dsp-services/release-dsp-delivery-query.service';


@Module({
	imports: [
		TypeOrmModule.forFeature([
			Release,
			AlbumFormat,
			Genre,
			Label,
			Timezone,
			Dsp,
			PriceTier,
			Country,
			ReleaseDspDelivery,
			ReleaseLog,
		]),

		AppConfigModule,

		ReleaseLanguageModule,
		ReleaseCoverArtModule,
		ReleaseArtistModule,
		ReleaseTerritoryModule,
		ReleaseLogModule,

		FileExportCiModule,

		TrackModule,
		BucketModule2,
		OrmModule,

		SftpConnectModule,
		SftpConfigsModule,
		UpcModule,
		DspModule,

		ErnModule,
		DspRoutingConfigsModule,

		CountryModule,
		AggregatorsModule,
	],
	controllers: [
		ReleaseController,
		ReleaseDraftController,
	],
	providers: [
		ReleaseService,
		ReleaseDraftService,
		ReleaseValidateService,
		ReleaseQueryService,

		// ReleaseDdexCiService,
		ReleaseDdexService,
		ReleaseDspDeliveryService, 
		ReleaseDspDeliveryQueryService
	],
	exports: [
		ReleaseDdexService,
		ReleaseQueryService,
		ReleaseValidateService,
	]
})
export class ReleaseModule {}
