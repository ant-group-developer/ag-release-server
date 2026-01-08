import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtistRole } from '../artist-role/entities/artist-role.entity';
import { Artist } from '../artist/entities/artist.entity';
import { ReleaseContributor } from '../release-contributor/entities/release-contributor.entity';
import { Track } from '../track/entities/track.entity';
import { TrackContributor } from './entities/track-contributor.entity';
import { TrackContributorService } from './services/track-contributor.service';
import { TrackContributorValidateService } from './services/track-contributor.validate.service';
import { TrackContributorController } from './track-contributor.controller';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			TrackContributor,
			ArtistRole,
			Artist,
			Track,
			ReleaseContributor,
		]),
	],
	controllers: [TrackContributorController],
	providers: [TrackContributorService, TrackContributorValidateService],
	exports: [TrackContributorService],
})
export class TrackContributorModule {}
