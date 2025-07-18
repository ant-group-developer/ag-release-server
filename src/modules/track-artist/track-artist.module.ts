import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtistRole } from '../artist-role/entities/artist-role.entity';
import { Artist } from '../artist/entities/artist.entity';
import { Track } from '../track/entities/track.entity';
import { TrackArtist } from './entities/track-artist.entity';
import { TrackArtistService } from './services/track-artist.service';
import { TrackArtistValidateService } from './services/track-artist.validate.service';
import { TrackArtistController } from './track-artist.controller';

@Module({
	imports: [
		TypeOrmModule.forFeature([TrackArtist, ArtistRole, Artist, Track]),
	],
	controllers: [TrackArtistController],
	providers: [TrackArtistService, TrackArtistValidateService],
	exports: [TrackArtistService],
})
export class TrackArtistModule {}
