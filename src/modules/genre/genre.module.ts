import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule } from '../bucket/bucket.module';
import { Genre } from './entities/genre.entity';
import { GenreController } from './genre.controller';
import { GenreService } from './genre.service';

@Module({
	imports: [TypeOrmModule.forFeature([Genre]), BucketModule],
	controllers: [GenreController],
	providers: [GenreService],
})
export class GenreModule {}
