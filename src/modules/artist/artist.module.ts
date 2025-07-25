import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule } from '../bucket/bucket.module';
import { ArtistController } from './artist.controller';
import { Artist } from './entities/artist.entity';
import { ArtistQueryService } from './services/artist.query.service';
import { ArtistService } from './services/artist.service';

@Module({
	imports: [TypeOrmModule.forFeature([Artist]), BucketModule],
	controllers: [ArtistController],
	providers: [ArtistService, ArtistQueryService],
})
export class ArtistModule {}
