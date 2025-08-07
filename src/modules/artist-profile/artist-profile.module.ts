import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Artist } from '../artist/entities/artist.entity';
import { Dsp } from '../dsp/entities/dsp.entity';
import { ArtistProfile } from './entities/artist-profile.entity';
import { ArtistProfileService } from './entities/artist-profile.service';

@Module({
	imports: [TypeOrmModule.forFeature([ArtistProfile, Dsp, Artist])],
	providers: [ArtistProfileService],
	exports: [ArtistProfileService],
})
export class ArtistProfileModule {}
