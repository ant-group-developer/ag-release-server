// src/access-bomb/access-bomb.module.ts
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessBombController } from './controllers/access-bomb.controller';
import { BombCrawController } from './controllers/bomb-craw.controller';
import { ParseDataCiController } from './controllers/parse-ci-v2.controller';
import { Release, ReleaseMetadata, Track } from './entities/metadata.entity';
import {
	Release_29_12,
	ReleaseBombAll,
	Track_29_12,
	TrackBombAll,
} from './entities/metadata.entity.29-12';
import { ReleaseCi, TrackCi } from './entities/release-ci.entity';
import { TrackBomb } from './entities/track-bomb.entity';
import { AccessBombService } from './services/access-bomb.service';
import { TrackBombCrawlService } from './services/bom-craw.service';
import { CrawlService_29_12 } from './services/bom-craw.service.29-12';
import { ParseDataCiService } from './services/parse-ci-v2.service';

@Module({
	imports: [
		HttpModule,
		TypeOrmModule.forFeature([
			ReleaseMetadata,
			Release,
			Track,
			TrackBomb,
			ReleaseCi,
			TrackCi,
			Release_29_12,
			Track_29_12,
			TrackBombAll,
			ReleaseBombAll,
		]),
	],
	controllers: [
		AccessBombController,
		ParseDataCiController,
		BombCrawController,
	],
	providers: [
		CrawlService_29_12,
		AccessBombService,
		ParseDataCiService,
		TrackBombCrawlService,
	],
})
export class AccessBombModule {}
