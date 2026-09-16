import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlbumFormat } from '../album-format/entities/album-format.entity';
import { AppConfigModule } from '../app-config/app-config.module';
import { Artist } from '../artist/entities/artist.entity';
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
import { ReleaseArtist } from '../release-artist/entities/release-artist.entity';
import { ReleaseArtistModule } from '../release-artist/release-artist.module';
import { ReleaseCoverArtModule } from '../release-cover-art/release-cover-art.module';
import { ReleaseLanguageModule } from '../release-language/release-language.module';
import { ReleaseTerritoryModule } from '../release-territory/release-territory.module';
import { Timezone } from '../timezone/entities/timezone.entity';
import { TrackModule } from '../track/track.module';
import { ReleaseController } from './controllers/release.controller';
import { ReleaseDraftController } from './controllers/release.draft.controller';
import { AutoSubmitHistory } from './entities/auto-submit-history.entity';
import { MetadataScanSession } from './entities/metadata-scan-session.entity';
import { ReleaseDspDelivery } from './entities/release-dsp-delivery.entity';
import { ReleaseEnrichment } from './entities/release-enrichment.entity';
import { Release } from './entities/release.entity';
import { ReleaseCiData } from './modules/release-ci-data/entities/release-ci-data.entity';
import { ReleaseCiDataModule } from './modules/release-ci-data/release-ci-data.module';
import { ReleaseError } from './modules/release-errors/entities/release-error.entity';
import { ReleaseErrorsModule } from './modules/release-errors/release-errors.module';
import { ReleaseLog } from './modules/release-log/entities/release-log.entity';
import { ReleaseLogModule } from './modules/release-log/release-log.module';
import { ReleaseReview } from './modules/release-reviews/entities/release-review.entity';
import { ReleaseReviewsModule } from './modules/release-reviews/release-reviews.module';
import { ReleaseDdexService } from './services/release-ddex.service';
// import { ReleaseDdexCiService } from './services/release.ddex-ci.service';
// import { ReleaseSpotifyService2 } from './services/release.ddex-spotify2.service';
import { ReleaseCiStatusSyncScheduleController } from './controllers/release-ci-status-sync-schedule.controller';
import { ReleaseDspDeliveryController } from './controllers/release-dsp-delivery.controller';
import { ReleaseCiStatusSyncSchedule } from './entities/release-ci-status-sync-schedule.entity';
import { ReleaseCiStatusSyncScheduleService } from './services/release-ci-status-sync-schedule.service';
import { ReleaseDspDeliveryQueryService } from './services/release-dsp-services/release-dsp-delivery-query.service';
import { ReleaseDspDeliveryService } from './services/release-dsp-services/release-dsp-delivery.service';
import { ReleaseReportImportService } from './services/release-report-import.service';
import { ReleaseDraftService } from './services/release.draft.service';
import { ReleaseQueryService } from './services/release.query.service';
import { ReleaseService } from './services/release.service';
import { ReleaseValidateService } from './services/release.validate.service';
// import { ReleaseExecutionsModule } from './modules/release-executions/release-executions.module';
import { ErnModule2 } from '../ern2/ern.module';
import { LogsModule } from '../log/logs.module';
import { CiModule } from '../partners-api/ci/ci.module';
import { TrackArtist } from '../track-artist/entities/track-artist.entity';
import { Track } from '../track/entities/track.entity';
import { ReleaseExecutionController } from './modules/release-executions/controllers/release-execution.controller';
import { ReleaseExecutionDsp } from './modules/release-executions/entities/release-execution-dsp.entity';
import { ReleaseExecutionStep } from './modules/release-executions/entities/release-execution-step.entity';
import { ReleaseExecution } from './modules/release-executions/entities/release-execution.entity';
import { ReleaseExecutionProcessorService } from './modules/release-executions/services/release-execution-processor.service';
import { ReleaseExecutionsQueryService } from './modules/release-executions/services/release-executions.query.service';
import { ReleaseExecutionsService } from './modules/release-executions/services/release-executions.service';
import { ReportEntityExtractorService } from './services/report-entity-extractor.service';

import { ReleaseExecution3Controller } from './modules/release-executions3/controllers/release-execution3.controller';
import { ReleaseExecutionStepTestController } from './modules/release-executions3/controllers/release-execution3.engine.controller';
import { ReleaseExecutionResult3 } from './modules/release-executions3/entites/release-execution3-result.entity';
import { ReleaseExecutionStep3 } from './modules/release-executions3/entites/release-execution3-step.entity';
import { ReleaseExecution3 } from './modules/release-executions3/entites/release-execution3.entity';
import { ReleaseExecution3Service } from './modules/release-executions3/services/release-execution3.service';

import { AssetOwnershipModule } from '../asset-import/asset-ownership.module';
import { PartnersApiModule } from '../partners-api/partners-api.module';
import { ReleaseCaption } from '../release-caption/entities/release-caption.entity';
import { ReleaseCaptionModule } from '../release-caption/release-caption.module';
import { VideoArtist } from '../video-artist/entities/video-artist.entity';
import { VideoContributor } from '../video-contributor/entities/video-contributor.entity';
import { Video } from '../video/entities/video.entity';
import { VideoModule } from '../video/video.module';
import { CiDistributionJob3Controller } from './modules/release-executions3/controllers/ci-distribution-job3.controller';
import { ReleaseSubmitTestController } from './modules/release-executions3/controllers/release-submit-test.controller';
import { CiDistributionJob3 } from './modules/release-executions3/entites/ci-distribution-job3.entity';
import { CiDistributionJob3Service } from './modules/release-executions3/services/ci-distribution-job3.service';
import { ReleaseExecution3Consumer } from './modules/release-executions3/services/queue/release-execution3.consumer';
import { ReleaseExecution3Queue } from './modules/release-executions3/services/queue/release-execution3.queue';
import { ReleaseExecution3ResultService } from './modules/release-executions3/services/release-execution3-result.service';
import { ReleaseExecution3Builder } from './modules/release-executions3/services/release-execution3.builder';
import { ReleaseExecution3CronJobService } from './modules/release-executions3/services/release-execution3.cron-job.service';
import { ReleaseExecutionStepEngine } from './modules/release-executions3/services/release-execution3.engine';
import { ReleaseExecution3QueryService } from './modules/release-executions3/services/release-execution3.query.service';
import { ReleaseExecution3Worker } from './modules/release-executions3/services/release-execution3.worker';
import { VevoJobResultService } from './modules/release-executions3/services/vevo-job-result.service';

import { ReleaseExecution3RunPipelineQueue } from './modules/release-executions3/entites/release-execution3.queue.entity';
import { ReleaseExecution3WorkerTest } from './modules/release-executions3/services/release-execution3-test.worker';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			Release,
			Track,
			Artist,
			ReleaseArtist,
			TrackArtist,
			AlbumFormat,
			Genre,
			Label,
			Timezone,
			Dsp,
			PriceTier,
			Country,
			ReleaseDspDelivery,
			ReleaseCiStatusSyncSchedule,
			ReleaseLog,
			ReleaseEnrichment,
			MetadataScanSession,
			AutoSubmitHistory,
			ReleaseCiData,
			ReleaseError,
			ReleaseReview,

			ReleaseExecution,
			ReleaseExecutionDsp,
			ReleaseExecutionStep,

			ReleaseExecution3,
			ReleaseExecutionStep3,
			ReleaseExecutionResult3,
			CiDistributionJob3,
			ReleaseExecution3RunPipelineQueue,

			Video,
			VideoArtist,
			ReleaseCaption,
			VideoContributor,
		]),

		AppConfigModule,
		LogsModule,

		ReleaseLanguageModule,
		ReleaseCoverArtModule,
		ReleaseArtistModule,
		ReleaseTerritoryModule,
		VideoModule,
		ReleaseCaptionModule,
		ReleaseLogModule,
		forwardRef(() => ReleaseCiDataModule),
		ReleaseErrorsModule,
		forwardRef(() => ReleaseReviewsModule),

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
		AssetOwnershipModule,

		// ReleaseExecutions3Module,
	],
	controllers: [
		ReleaseController,
		ReleaseDraftController,
		ReleaseDspDeliveryController,
		ReleaseCiStatusSyncScheduleController,

		ReleaseExecutionController,

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
		ReleaseReportImportService,
		ReleaseDdexService,
		ReleaseDspDeliveryService,
		ReleaseDspDeliveryQueryService,
		ReleaseCiStatusSyncScheduleService,
		ReportEntityExtractorService,

		// v1
		ReleaseExecutionsService,
		ReleaseExecutionsQueryService,
		ReleaseExecutionProcessorService,

		// v3
		ReleaseExecution3Builder,
		ReleaseExecution3CronJobService,
		ReleaseExecutionStepEngine,
		ReleaseExecution3Service,
		ReleaseExecution3QueryService,
		ReleaseExecution3ResultService,
		ReleaseExecution3Queue,
		ReleaseExecution3Consumer,
		ReleaseExecution3Worker,
		VevoJobResultService,
		CiDistributionJob3Service,
		ReleaseExecution3WorkerTest,
	],
	exports: [
		ReleaseDdexService,
		ReleaseService,
		ReleaseQueryService,
		ReleaseReportImportService,
		ReleaseValidateService,
		ReportEntityExtractorService,
		ReleaseExecution3CronJobService,
		ReleaseExecution3Service,
		ReleaseExecution3ResultService,
		VevoJobResultService,
		ReleaseDspDeliveryService,
	],
})
export class ReleaseModule {}
