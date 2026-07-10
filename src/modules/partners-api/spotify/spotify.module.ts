import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from 'src/modules/app-config/app-config.module';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { ClickHouseModule } from 'src/modules/clickhouse/clickhouse.module';
import { Label } from 'src/modules/label/entities/label.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { MetadataScanSchedule } from 'src/modules/release/entities/metadata-scan-schedule.entity';
import { MetadataScanSession } from 'src/modules/release/entities/metadata-scan-session.entity';
import { ReleaseEnrichment } from 'src/modules/release/entities/release-enrichment.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { CiToolModule } from '../ci-tool/ci-tool.module';
import { YoutubeModule } from '../youtube/youtube.module';
import { SpotifyController } from './controllers/spotify.controller';
import { DeezerEnrichmentService } from './services/deezer-enrichment.service';
import { EnrichEventsGateway } from './services/enrich-events.gateway';
import { LocalEnrichmentService } from './services/local-enrichment.service';
import { MetadataEnrichmentService } from './services/metadata-enrichment.service';
import { MetadataScanScheduleService } from './services/metadata-scan-schedule.service';
import { MetadataScanService } from './services/metadata-scan.service';
import { MetadataSyncService } from './services/metadata-sync.service';
import { SpotifyEnrichmentService } from './services/spotify-enrichment.service';
import { SpotifyService } from './services/spotify.service';
import { SpotifyService2 } from './services/spotify2.service';

@Module({
	imports: [
		AppConfigModule,
		ClickHouseModule,
		CiToolModule,
		YoutubeModule,
		TypeOrmModule.forFeature([
			Release,
			Track,
			Artist,
			ReleaseArtist,
			TrackArtist,
			Label,
			ReleaseEnrichment,
			MetadataScanSession,
			MetadataScanSchedule,
		]),
	],
	controllers: [SpotifyController],
	providers: [
		SpotifyService,
		SpotifyService2,
		SpotifyEnrichmentService,
		DeezerEnrichmentService,
		LocalEnrichmentService,
		MetadataEnrichmentService,
		MetadataSyncService,
		MetadataScanService,
		MetadataScanScheduleService,
		EnrichEventsGateway,
	],
	exports: [
		SpotifyService,
		SpotifyService2,
		SpotifyEnrichmentService,
		DeezerEnrichmentService,
		LocalEnrichmentService,
		MetadataEnrichmentService,
		MetadataSyncService,
		MetadataScanService,
		MetadataScanScheduleService,
		EnrichEventsGateway,
	],
})
export class SpotifyModule {}
