import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtistController } from './artist.controller';
import { Artist } from './entities/artist.entity';
import { ArtistService } from './services/artist.service';
import { ArtistValidateService } from './services/artist.validate.service';

@Module({
	imports: [TypeOrmModule.forFeature([Artist])],
	controllers: [ArtistController],
	providers: [ArtistService, ArtistValidateService],
})
export class ArtistModule {}
