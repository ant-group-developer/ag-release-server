import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from 'src/modules/channel/entities/channel.entity';
import { ClickHouseModule } from 'src/modules/clickhouse/clickhouse.module';
import { Release } from 'src/modules/release/entities/release.entity';
import { ReleaseModule } from 'src/modules/release/release.module';
import { Track } from 'src/modules/track/entities/track.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { Video } from 'src/modules/video/entities/video.entity';
import { VideoArtist } from 'src/modules/video-artist/entities/video-artist.entity';
import { VideoCsvImportController } from './video-csv-import.controller';
import { VideoCsvImportService } from './video-csv-import.service';

@Module({
	imports: [
		MulterModule.register({
			limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
		}),
		TypeOrmModule.forFeature([Video, Channel, Release, Track, TrackArtist, VideoArtist]),
		ClickHouseModule,
		ReleaseModule,
	],
	controllers: [VideoCsvImportController],
	providers: [VideoCsvImportService],
})
export class VideoCsvImportModule {}
