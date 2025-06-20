import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrackArtist } from './entities/track-artist.entity';

@Module({
	imports: [TypeOrmModule.forFeature([TrackArtist])],
})
export class TrackArtistModule {}
