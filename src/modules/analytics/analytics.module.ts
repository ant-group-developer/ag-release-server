import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Track } from 'src/modules/track/entities/track.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';

// Controllers
import { TimelineAnalyticsController } from './controllers/global-timeline-analytics.controller';
import { RankingController } from './controllers/global.ranking.controller';

// Services
import { IsrcResolverService } from './services/isrc-resolver.service';
import { TimelineAnalyticsService } from './services/global-timeline.service';
import { RankingService } from './services/ranking.service';
import { ClickHouseSyncService } from './services/clickhouse-sync.service';
import { DspSeedingService } from 'src/modules/dsp/services/dsp-seeding.service';
import { ReleaseAnalyticsController } from './controllers/release-analytics.controller';
import { EntityAnalyticsService } from './services/entity-analytics.service';
import { LabelAnalyticsController } from './controllers/label-analytics.controller';
import { TrackAnalyticsController } from './controllers/track-analytics.controller';
import { ArtistAnalyticsController } from './controllers/artist-analytics.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Track, Release, Label, Artist, TrackArtist, Dsp]),
  ],
  controllers: [
    TimelineAnalyticsController,
    RankingController,
    ReleaseAnalyticsController,
    LabelAnalyticsController,
    TrackAnalyticsController,
    ArtistAnalyticsController,
  ],
  providers: [
    EntityAnalyticsService,
    IsrcResolverService,
    TimelineAnalyticsService,
    RankingService,
    ClickHouseSyncService,
    DspSeedingService,
  ],
  exports: [IsrcResolverService],
})
export class AnalyticsModule { }
