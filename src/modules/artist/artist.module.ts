import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtistProfileModule } from '../artist-profile/artist-profile.module';
import { BucketModule } from '../bucket/bucket.module';
import { ArtistController } from './artist.controller';
import { Artist } from './entities/artist.entity';
import { ArtistQueryService } from './services/artist.query.service';
import { ArtistService } from './services/artist.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([Artist]),
		BucketModule,
		ArtistProfileModule,
		HttpModule,
	],
	controllers: [ArtistController],
	providers: [ArtistService, ArtistQueryService],
})
export class ArtistModule {}
