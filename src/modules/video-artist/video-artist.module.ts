import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Artist } from '../artist/entities/artist.entity';
import { Video } from '../video/entities/video.entity';
import { VideoArtist } from './entities/video-artist.entity';
import { VideoArtistService } from './services/video-artist.service';
import { VideoArtistValidateService } from './services/video-artist.validate.service';
import { VideoArtistController } from './video-artist.controller';

@Module({
	imports: [TypeOrmModule.forFeature([VideoArtist, Artist, Video])],
	controllers: [VideoArtistController],
	providers: [VideoArtistService, VideoArtistValidateService],
	exports: [VideoArtistService],
})
export class VideoArtistModule {}
