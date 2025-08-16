import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Artist } from '../artist/entities/artist.entity';
import { Dsp } from '../dsp/entities/dsp.entity';
import { ArtistProfileService } from './artist-profile.service';
import { ArtistProfile } from './entities/artist-profile.entity';

@Module({
	imports: [TypeOrmModule.forFeature([ArtistProfile, Dsp, Artist])],
	providers: [ArtistProfileService],
	exports: [ArtistProfileService],
})
export class ArtistProfileModule {}
