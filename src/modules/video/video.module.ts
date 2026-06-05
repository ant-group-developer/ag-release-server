import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '../app-config/app-config.module';
import { Channel } from '../channel/entities/channel.entity';
import { IsrcModule } from '../external/isrc/isrc.module';
import { ReleaseLog } from '../release/modules/release-log/entities/release-log.entity';
import { ReleaseLogService } from '../release/modules/release-log/services/release-log.service';
import { Video } from './entities/video.entity';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([Video, Channel, ReleaseLog]),
		AppConfigModule,
		IsrcModule,
	],
	controllers: [VideoController],
	providers: [VideoService, ReleaseLogService],
	exports: [VideoService],
})
export class VideoModule {}
