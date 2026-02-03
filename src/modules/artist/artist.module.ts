import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtistProfileModule } from '../artist-profile/artist-profile.module';
import { BucketModule } from '../bucket/bucket.module';
import { ArtistController } from './controllers/artist.controller';
import { ArtistDataController } from './controllers/artist.data.controller';
import { Artist } from './entities/artist.entity';
import { ArtistDataInit } from './services/artist.data.service';
import { ArtistQueryService } from './services/artist.query.service';
import { ArtistService } from './services/artist.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([Artist]),
		BucketModule,
		ArtistProfileModule,
		HttpModule,
	],
	controllers: [ArtistController, ArtistDataController],
	providers: [ArtistService, ArtistQueryService, ArtistDataInit],
})
export class ArtistModule {}
