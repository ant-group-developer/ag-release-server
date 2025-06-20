import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReleaseArtist } from './entities/release-artist.entity';

@Module({
	imports: [TypeOrmModule.forFeature([ReleaseArtist])],
})
export class ReleaseArtistModule {}
