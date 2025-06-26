import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtistController } from './artist.controller';
import { ArtistService } from './artist.service';
import { Artist } from './entities/artist.entity';

@Module({
	imports: [TypeOrmModule.forFeature([Artist])],
	controllers: [ArtistController],
	providers: [ArtistService],
})
export class ArtistModule {}
