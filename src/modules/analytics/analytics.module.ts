import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Track } from 'src/modules/track/entities/track.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';

// Controllers
import { TimelineAnalyticsController } from './controllers/timeline-analytics.controller';
import { RankingController } from './controllers/ranking.controller';

// Services
import { IsrcResolverService } from './services/isrc-resolver.service';
import { TimelineAnalyticsService } from './services/timeline-analytics.service';
import { RankingService } from './services/ranking.service';
import { ClickHouseSyncService } from './services/clickhouse-sync.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Track, Release, Label, Artist, TrackArtist]),
  ],
  controllers: [TimelineAnalyticsController, RankingController],
  providers: [
    IsrcResolverService,
    TimelineAnalyticsService,
    RankingService,
    ClickHouseSyncService,
  ],
  exports: [IsrcResolverService],
})
export class AnalyticsModule {}
