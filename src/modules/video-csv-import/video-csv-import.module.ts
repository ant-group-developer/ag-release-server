import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from 'src/modules/channel/entities/channel.entity';
import { ClickHouseModule } from 'src/modules/clickhouse/clickhouse.module';
import { ReleaseModule } from 'src/modules/release/release.module';
import { Video } from 'src/modules/video/entities/video.entity';
import { VideoCsvImportController } from './video-csv-import.controller';
import { VideoCsvImportService } from './video-csv-import.service';

@Module({
	imports: [
		MulterModule.register({
			limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
		}),
		TypeOrmModule.forFeature([Video, Channel]),
		ClickHouseModule,
		ReleaseModule,
	],
	controllers: [VideoCsvImportController],
	providers: [VideoCsvImportService],
})
export class VideoCsvImportModule {}
