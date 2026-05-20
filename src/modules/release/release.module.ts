import { Module } from '@nestjs/common';
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
import { ErnModule } from '../ern/ern.module';
import { UpcModule } from '../external/upc/upc.module';
import { FileExportCiModule } from '../file-export-ci/file-export-ci.module';
import { Genre } from '../genre/entities/genre.entity';
import { Label } from '../label/entities/label.entity';
import { NotificationModule } from '../notification/notification.module';
import { OrmModule } from '../orm/orm.module';
import { PriceTier } from '../price-tiers/entities/price-tier.entity';
import { ReleaseArtistModule } from '../release-artist/release-artist.module';
import { ReleaseCoverArtModule } from '../release-cover-art/release-cover-art.module';
import { ReleaseLanguageModule } from '../release-language/release-language.module';
import { ReleaseTerritoryModule } from '../release-territory/release-territory.module';
import { Timezone } from '../timezone/entities/timezone.entity';
import { TrackModule } from '../track/track.module';
import { ReleaseController } from './controllers/release.controller';
import { ReleaseDraftController } from './controllers/release.draft.controller';
import { ReleaseDspDelivery } from './entities/release-dsp-delivery.entity';
import { Release } from './entities/release.entity';
import { ReleaseLog } from './modules/release-log/entities/release-log.entity';
import { ReleaseLogModule } from './modules/release-log/release-log.module';
import { ReleaseDdexService } from './services/release-ddex.service';
// import { ReleaseDdexCiService } from './services/release.ddex-ci.service';
// import { ReleaseSpotifyService2 } from './services/release.ddex-spotify2.service';
import { ReleaseDspDeliveryController } from './controllers/release-dsp-delivery.controller';
import { ReleaseDspDeliveryQueryService } from './services/release-dsp-services/release-dsp-delivery-query.service';
import { ReleaseDspDeliveryService } from './services/release-dsp-services/release-dsp-delivery.service';
import { ReleaseDraftService } from './services/release.draft.service';
import { ReleaseQueryService } from './services/release.query.service';
import { ReleaseService } from './services/release.service';
import { ReleaseValidateService } from './services/release.validate.service';
// import { ReleaseExecutionsModule } from './modules/release-executions/release-executions.module';
import { ErnModule2 } from '../ern2/ern.module';
import { LogsModule } from '../log/logs.module';
import { CiModule } from '../partners-api/ci/ci.module';
import { Track } from '../track/entities/track.entity';
import { ReleaseExecutionController } from './modules/release-executions/controllers/release-execution.controller';
import { ReleaseExecutionDsp } from './modules/release-executions/entities/release-execution-dsp.entity';
import { ReleaseExecutionStep } from './modules/release-executions/entities/release-execution-step.entity';
import { ReleaseExecution } from './modules/release-executions/entities/release-execution.entity';
import { ReleaseExecutionProcessorService } from './modules/release-executions/services/release-execution-processor.service';
import { ReleaseExecutionsQueryService } from './modules/release-executions/services/release-executions.query.service';
import { ReleaseExecutionsService } from './modules/release-executions/services/release-executions.service';
import { ReleaseExecutionStep3 } from './modules/release-executions3/entites/release-execution3-step.entity';
import { ReleaseExecution3 } from './modules/release-executions3/entites/release-execution3.entity';
import { CiDistributionJobController } from './modules/release-submit/controllers/ci-distribution-job.controller';
import { ReleaseSubmitController } from './modules/release-submit/controllers/release-submit.controller';
import { CiDistributionJob } from './modules/release-submit/entities/ci-distribution-job.entity';
import { ReleaseSubmitStep } from './modules/release-submit/entities/release-submit-step.entity';
import { ReleaseSubmit } from './modules/release-submit/entities/release-submit.entity';
import { CiDistributionJobService } from './modules/release-submit/services/ci-distribution-job.service';
import { ReleaseSubmitService2 } from './modules/release-submit/services/release-submit2.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			Release,
			Track,
			AlbumFormat,
			Genre,
			Label,
			Timezone,
			Dsp,
			PriceTier,
			Country,
			ReleaseDspDelivery,
			ReleaseLog,

			ReleaseExecution,
			ReleaseExecutionDsp,
			ReleaseExecutionStep,

			ReleaseSubmit,
			ReleaseSubmitStep,
			CiDistributionJob,

			ReleaseExecution3,
			ReleaseExecutionStep3,
		]),

		AppConfigModule,
		LogsModule,

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
		ErnModule2,
		DspRoutingConfigsModule,

		CountryModule,
		AggregatorsModule,
		NotificationModule,
		CiModule,
	],
	controllers: [
		ReleaseController,
		ReleaseDraftController,
		ReleaseDspDeliveryController,

		ReleaseExecutionController,

		ReleaseSubmitController,
		CiDistributionJobController,
	],
	providers: [
		ReleaseService,
		ReleaseDraftService,
		ReleaseValidateService,
		ReleaseQueryService,
		ReleaseDdexService,
		ReleaseDspDeliveryService,
		ReleaseDspDeliveryQueryService,

		ReleaseExecutionsService,
		ReleaseExecutionsQueryService,
		ReleaseExecutionProcessorService,
		ReleaseSubmitService2,
		CiDistributionJobService,
	],
	exports: [ReleaseDdexService, ReleaseQueryService, ReleaseValidateService],
})
export class ReleaseModule {}
