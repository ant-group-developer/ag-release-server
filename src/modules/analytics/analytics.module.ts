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

// Controllers
import { TimelineAnalyticsController } from './controllers/global-timeline-analytics.controller';
import { RankingController } from './controllers/global.ranking.controller';
import { ReleaseAnalyticsController } from './controllers/release-analytics.controller';
import { LabelAnalyticsController } from './controllers/label-analytics.controller';
import { TrackAnalyticsController } from './controllers/track-analytics.controller';
import { ArtistAnalyticsController } from './controllers/artist-analytics.controller';
import { DashboardAnalyticsController } from './controllers/dashboard-analytics.controller';

// Services
import { IsrcResolverService } from './services/isrc-resolver.service';
import { TimelineAnalyticsService } from './services/global-timeline.service';
import { RankingService } from './services/ranking.service';
import { ClickHouseSyncService } from './services/clickhouse-sync.service';
import { DspSeedingService } from 'src/modules/dsp/services/dsp-seeding.service';
import { EntityAnalyticsService } from './services/entity-analytics.service';
import { DashboardAnalyticsService } from './services/dashboard-analytics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Track, Release, Label, Artist, TrackArtist, Dsp, Tenant]),
  ],
  controllers: [
    TimelineAnalyticsController,
    RankingController,
    ReleaseAnalyticsController,
    LabelAnalyticsController,
    TrackAnalyticsController,
    ArtistAnalyticsController,
    DashboardAnalyticsController,
  ],
  providers: [
    EntityAnalyticsService,
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
