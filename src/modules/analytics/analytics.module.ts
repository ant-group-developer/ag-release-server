import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { BucketModule2 } from 'src/modules/bucket2/bucket2.module';
import { Channel } from 'src/modules/channel/entities/channel.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { ImportJobsModule } from 'src/modules/etl/import-jobs.module';
import { Label } from 'src/modules/label/entities/label.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { TenantModule } from 'src/modules/tenant/tenant.module';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { Track } from 'src/modules/track/entities/track.entity';

// Controllers
import { AnalyticsReportExportController } from './controllers/analytics-report-export.controller';
import { ArtistAnalyticsController } from './controllers/artist-analytics.controller';
import { ChannelAnalyticsController } from './controllers/channel-analytics.controller';
import { DashboardAnalyticsController } from './controllers/dashboard-analytics.controller';
import { DspAnalyticsController } from './controllers/dsp-analytics.controller';
import { TimelineAnalyticsController } from './controllers/global-timeline-analytics.controller';
import { RankingController } from './controllers/global.ranking.controller';
import { LabelAnalyticsController } from './controllers/label-analytics.controller';
import { ReleaseAnalyticsController } from './controllers/release-analytics.controller';
import { SourceTypeAnalyticsController } from './controllers/source-type-analytics.controller';
import { TenantAnalyticsController } from './controllers/tenant-analytics.controller';
import { TrackAnalyticsController } from './controllers/track-analytics.controller';

// Services
import { DspSeedingService } from 'src/modules/dsp/services/dsp-seeding.service';
import { AnalyticsCacheService } from './services/analytics-cache.service';
import { AnalyticsReportExportService } from './services/analytics-report-export.service';
import { ClickHouseSyncService } from './services/clickhouse-sync.service';
import { DashboardAnalyticsService } from './services/dashboard-analytics.service';
import { DspAnalyticsService } from './services/dsp-analytics.service';
import { EntityAnalyticsService } from './services/entity-analytics.service';
import { ExportQueueService } from './services/export-queue.service';
import { TimelineAnalyticsService } from './services/global-timeline.service';
import { IsrcResolverService } from './services/isrc-resolver.service';
import { RankingService } from './services/ranking.service';
import { ExportWorkerPoolService } from './workers/export-worker-pool.service';

@Module({
	imports: [
		BucketModule2,
		ImportJobsModule,
		TenantModule,
		TypeOrmModule.forFeature([
			Track,
			Release,
			Label,
			Artist,
			TrackArtist,
			Dsp,
			Tenant,
			Channel,
		]),
	],
	controllers: [
		TimelineAnalyticsController,
		RankingController,
		ReleaseAnalyticsController,
		LabelAnalyticsController,
		TrackAnalyticsController,
		ArtistAnalyticsController,
		DashboardAnalyticsController,
		AnalyticsReportExportController,
		TenantAnalyticsController,
		ChannelAnalyticsController,
		DspAnalyticsController,
		SourceTypeAnalyticsController,
	],
	providers: [
		EntityAnalyticsService,
		AnalyticsReportExportService,
		ExportQueueService,
		ExportWorkerPoolService,
		IsrcResolverService,
		TimelineAnalyticsService,
		RankingService,
		ClickHouseSyncService,
		DspSeedingService,
		DashboardAnalyticsService,
		AnalyticsCacheService,
		DspAnalyticsService,
	],
	exports: [IsrcResolverService],
})
export class AnalyticsModule {}
