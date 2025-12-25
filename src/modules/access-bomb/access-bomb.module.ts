// src/access-bomb/access-bomb.module.ts
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessBombController } from './access-bomb.controller';
import { AccessBombService } from './access-bomb.service';
import { Release, ReleaseMetadata, Track } from './entities/metadata.entity';
import { ParseDataCiController } from './parse-ci-v2.controller';
import { ParseDataCiService } from './parse-ci-v2.service';

@Module({
	imports: [
		HttpModule,
		TypeOrmModule.forFeature([ReleaseMetadata, Release, Track]),
	],
	controllers: [AccessBombController, ParseDataCiController],
	providers: [AccessBombService, ParseDataCiService],
})
export class AccessBombModule {}
