import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule2 } from '../bucket2/bucket2.module';
import { Genre } from './entities/genre.entity';
import { GenreController } from './genre.controller';
import { GenreQueryService } from './services/genre.query.service';
import { GenreService } from './services/genre.service';

@Module({
	imports: [TypeOrmModule.forFeature([Genre]), BucketModule2],
	controllers: [GenreController],
	providers: [GenreService, GenreQueryService],
})
export class GenreModule {}
