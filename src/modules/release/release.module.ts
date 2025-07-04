import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Genre } from '../genre/entities/genre.entity';
import { Label } from '../label/entities/label.entity';
import { Timezone } from '../timezone/entities/timezone.entity';
import { ReleaseController } from './controllers/release.controller';
import { ReleaseDraftController } from './controllers/release.draft.controller';
import { Release } from './entities/release.entity';
import { ReleaseDraftService } from './services/release.draft.service';
import { ReleaseQbService } from './services/release.qb.service';
import { ReleaseService } from './services/release.service';
import { ReleaseValidateService } from './services/release.validate.service';

@Module({
	imports: [TypeOrmModule.forFeature([Release, Genre, Label, Timezone])],
	controllers: [ReleaseController, ReleaseDraftController],
	providers: [
		ReleaseService,
		ReleaseDraftService,
		ReleaseValidateService,
		ReleaseQbService,
	],
})
export class ReleaseModule {}
