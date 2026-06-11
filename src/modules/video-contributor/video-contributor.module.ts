import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtistRole } from '../artist-role/entities/artist-role.entity';
import { Artist } from '../artist/entities/artist.entity';
import { Video } from '../video/entities/video.entity';
import { VideoContributor } from './entities/video-contributor.entity';
import { VideoContributorService } from './services/video-contributor.service';
import { VideoContributorValidateService } from './services/video-contributor.validate.service';
import { VideoContributorController } from './video-contributor.controller';

@Module({
	imports: [
		TypeOrmModule.forFeature([VideoContributor, ArtistRole, Artist, Video]),
	],
	controllers: [VideoContributorController],
	providers: [VideoContributorService, VideoContributorValidateService],
	exports: [VideoContributorService],
})
export class VideoContributorModule {}
