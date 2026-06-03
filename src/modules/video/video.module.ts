import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from '../channel/entities/channel.entity';
import { Video } from './entities/video.entity';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';

@Module({
	imports: [TypeOrmModule.forFeature([Video, Channel])],
	controllers: [VideoController],
	providers: [VideoService],
	exports: [VideoService],
})
export class VideoModule {}
