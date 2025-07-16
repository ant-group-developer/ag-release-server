import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtistRole } from '../artist-role/entities/artist-role.entity';
import { Artist } from '../artist/entities/artist.entity';
import { Release } from '../release/entities/release.entity';
import { ReleaseArtist } from './entities/release-artist.entity';
import { ReleaseArtistController } from './release-artist.controller';
import { ReleaseArtistService } from './services/release-artist.service';
import { ReleaseArtistValidateService } from './services/release-artist.validate.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([ReleaseArtist, Artist, ArtistRole, Release]),
	],
	controllers: [ReleaseArtistController],
	providers: [ReleaseArtistService, ReleaseArtistValidateService],
	exports: [ReleaseArtistService],
})
export class ReleaseArtistModule {}
