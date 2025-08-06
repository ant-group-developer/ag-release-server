import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtistProfile } from './entities/artist-profile.entity';

@Module({
	imports: [TypeOrmModule.forFeature([ArtistProfile])],
	controllers: [],
	providers: [],
})
export class ArtistProfileModule {}
