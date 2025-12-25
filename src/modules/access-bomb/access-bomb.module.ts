// src/access-bomb/access-bomb.module.ts
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessBombController } from './controllers/access-bomb.controller';
import { BombCrawController } from './controllers/bomb-craw.controller';
import { ParseDataCiController } from './controllers/parse-ci-v2.controller';
import { Release, ReleaseMetadata, Track } from './entities/metadata.entity';
import { TrackBomb } from './entities/track-bomb.entity';
import { AccessBombService } from './services/access-bomb.service';
import { TrackBombCrawlService } from './services/bom-craw.service';
import { ParseDataCiService } from './services/parse-ci-v2.service';

@Module({
	imports: [
		HttpModule,
		TypeOrmModule.forFeature([ReleaseMetadata, Release, Track, TrackBomb]),
	],
	controllers: [
		AccessBombController,
		ParseDataCiController,
		BombCrawController,
	],
	providers: [AccessBombService, ParseDataCiService, TrackBombCrawlService],
})
export class AccessBombModule {}
