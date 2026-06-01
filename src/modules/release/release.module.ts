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

import { ReleaseExecution3Controller } from './modules/release-executions3/controllers/release-execution3.controller';
import { ReleaseExecutionStepTestController } from './modules/release-executions3/controllers/release-execution3.engine.controller';
import { ReleaseExecutionStep3 } from './modules/release-executions3/entites/release-execution3-step.entity';
import { ReleaseExecution3 } from './modules/release-executions3/entites/release-execution3.entity';
import { ReleaseExecution3Service } from './modules/release-executions3/services/release-execution3.service';

import { PartnersApiModule } from '../partners-api/partners-api.module';
import { VideoArtist } from '../video-artist/entities/video-artist.entity';
import { VideoContributor } from '../video-contributor/entities/video-contributor.entity';
import { Video } from '../video/entities/video.entity';
import { VideoModule } from '../video/video.module';
import { CiDistributionJob3Controller } from './modules/release-executions3/controllers/ci-distribution-job3.controller';
import { ReleaseSubmitTestController } from './modules/release-executions3/controllers/release-submit-test.controller';
import { CiDistributionJob3 } from './modules/release-executions3/entites/ci-distribution-job3.entity';
import { CiDistributionJob3Service } from './modules/release-executions3/services/ci-distribution-job3.service';
import { ReleaseExecution3Builder } from './modules/release-executions3/services/release-execution3.builder';
import { ReleaseExecutionStepEngine } from './modules/release-executions3/services/release-execution3.engine';
import { ReleaseExecution3Worker } from './modules/release-executions3/services/release-execution3.worker';
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
			CiDistributionJob3,

			Video,
			VideoArtist,
			VideoContributor,
		]),

		AppConfigModule,
		LogsModule,

		ReleaseLanguageModule,
		ReleaseCoverArtModule,
		ReleaseArtistModule,
		ReleaseTerritoryModule,
		VideoModule,
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

		PartnersApiModule,

		// ReleaseExecutions3Module,
	],
	controllers: [
		ReleaseController,
		ReleaseDraftController,
		ReleaseDspDeliveryController,

		ReleaseExecutionController,

		ReleaseSubmitController,
		CiDistributionJobController,

		ReleaseExecution3Controller,
		ReleaseSubmitTestController,
		ReleaseExecutionStepTestController,
		CiDistributionJob3Controller,
	],
	providers: [
		ReleaseService,
		ReleaseDraftService,
		ReleaseValidateService,
		ReleaseQueryService,
		ReleaseDdexService,
		ReleaseDspDeliveryService,
		ReleaseDspDeliveryQueryService,

		// v1
		ReleaseExecutionsService,
		ReleaseExecutionsQueryService,
		ReleaseExecutionProcessorService,

		// v2
		ReleaseSubmitService2,
		CiDistributionJobService,

		// v3
		ReleaseExecution3Builder,
		ReleaseExecutionStepEngine,
		ReleaseExecution3Service,
		ReleaseExecution3Worker,
		CiDistributionJob3Service,
	],
	exports: [ReleaseDdexService, ReleaseQueryService, ReleaseValidateService],
})
export class ReleaseModule {}
