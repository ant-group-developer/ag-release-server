import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule } from '../bucket/bucket.module';
import { ArtistController } from './artist.controller';
import { Artist } from './entities/artist.entity';
import { ArtistService } from './services/artist.service';

@Module({
	imports: [TypeOrmModule.forFeature([Artist]), BucketModule],
	controllers: [ArtistController],
	providers: [ArtistService],
})
export class ArtistModule {}
