import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Track } from 'src/modules/track/entities/track.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { Channel } from 'src/modules/channel/entities/channel.entity';
import { BucketModule2 } from 'src/modules/bucket2/bucket2.module';
import { ImportJobsModule } from 'src/modules/etl/import-jobs.module';
import { TenantModule } from 'src/modules/tenant/tenant.module';

// Controllers
import { TimelineAnalyticsController } from './controllers/global-timeline-analytics.controller';
import { RankingController } from './controllers/global.ranking.controller';
import { ReleaseAnalyticsController } from './controllers/release-analytics.controller';
import { LabelAnalyticsController } from './controllers/label-analytics.controller';
import { TrackAnalyticsController } from './controllers/track-analytics.controller';
import { ArtistAnalyticsController } from './controllers/artist-analytics.controller';
import { DashboardAnalyticsController } from './controllers/dashboard-analytics.controller';
import { AnalyticsReportExportController } from './controllers/analytics-report-export.controller';
import { TenantAnalyticsController } from './controllers/tenant-analytics.controller';
import { ChannelAnalyticsController } from './controllers/channel-analytics.controller';

// Services
import { IsrcResolverService } from './services/isrc-resolver.service';
import { TimelineAnalyticsService } from './services/global-timeline.service';
import { RankingService } from './services/ranking.service';
import { ClickHouseSyncService } from './services/clickhouse-sync.service';
import { DspSeedingService } from 'src/modules/dsp/services/dsp-seeding.service';
import { EntityAnalyticsService } from './services/entity-analytics.service';
import { DashboardAnalyticsService } from './services/dashboard-analytics.service';
import { AnalyticsReportExportService } from './services/analytics-report-export.service';
import { ExportQueueService } from './services/export-queue.service';
import { ExportWorkerPoolService } from './workers/export-worker-pool.service';

@Module({
  imports: [
    BucketModule2,
    ImportJobsModule,
    TenantModule,
    TypeOrmModule.forFeature([Track, Release, Label, Artist, TrackArtist, Dsp, Tenant, Channel]),
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
  ],
  exports: [IsrcResolverService],
})
export class AnalyticsModule { }
