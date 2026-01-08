import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtistRole } from '../artist-role/entities/artist-role.entity';
import { Artist } from '../artist/entities/artist.entity';
import { Release } from '../release/entities/release.entity';
import { TrackModule } from '../track/track.module';
import { ReleaseContributor } from './entities/release-contributor.entity';
import { ReleaseContributorController } from './release-contributor.controller';
import { ReleaseContributorService } from './services/release-contributor.service';
import { ReleaseContributorValidateService } from './services/release-contributor.validate.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			ReleaseContributor,
			Artist,
			ArtistRole,
			Release,
		]),
		TrackModule,
	],
	controllers: [ReleaseContributorController],
	providers: [ReleaseContributorService, ReleaseContributorValidateService],
	exports: [ReleaseContributorService],
})
export class ReleaseContributorModule {}
