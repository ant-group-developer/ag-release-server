import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Genre } from '../genre/entities/genre.entity';
import { Label } from '../label/entities/label.entity';
import { Release } from './entities/release.entity';
import { ReleaseController } from './release.controller';
import { ReleaseService } from './services/release.service';
import { ReleaseValidateService } from './services/release.validate.service';

@Module({
	imports: [TypeOrmModule.forFeature([Release, Genre, Label])],
	controllers: [ReleaseController],
	providers: [ReleaseService, ReleaseValidateService],
})
export class ReleaseModule {}
