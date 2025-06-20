import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Genre } from './entities/genre.entity';

@Module({
	imports: [TypeOrmModule.forFeature([Genre])],
})
export class GenreModule {}
