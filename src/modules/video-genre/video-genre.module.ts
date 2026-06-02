import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Genre } from '../genre/entities/genre.entity';
import { Video } from '../video/entities/video.entity';
import { VideoGenre } from './entities/video-genre.entity';
import { VideoGenreService } from './services/video-genre.service';
import { VideoGenreController } from './video-genre.controller';

@Module({
	imports: [TypeOrmModule.forFeature([VideoGenre, Video, Genre])],
	controllers: [VideoGenreController],
	providers: [VideoGenreService],
	exports: [VideoGenreService],
})
export class VideoGenreModule {}
