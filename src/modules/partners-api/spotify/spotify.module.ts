import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from 'src/modules/app-config/app-config.module';
import { ClickHouseModule } from 'src/modules/clickhouse/clickhouse.module';
import { Release } from 'src/modules/release/entities/release.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { SpotifyController } from './controllers/spotify.controller';
import { MetadataEnrichmentService } from './services/metadata-enrichment.service';
import { MetadataScanService } from './services/metadata-scan.service';
import { SpotifyService } from './services/spotify.service';
import { SpotifyService2 } from './services/spotify2.service';

@Module({
	imports: [
		AppConfigModule,
		ClickHouseModule,
		TypeOrmModule.forFeature([Release, Track, Artist, ReleaseArtist, TrackArtist, Label]),
	],
	controllers: [SpotifyController],
	providers: [SpotifyService, SpotifyService2, MetadataEnrichmentService, MetadataScanService],
	exports: [SpotifyService, SpotifyService2, MetadataEnrichmentService, MetadataScanService],
})
export class SpotifyModule {}

