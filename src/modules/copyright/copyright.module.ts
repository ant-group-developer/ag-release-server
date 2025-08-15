import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule } from '../bucket/bucket.module';
import { Track } from '../track/entities/track.entity';
import { CopyrightResultController } from './controllers/copyright.result.controller';
import { CopyrightTaskController } from './controllers/copyright.task.controller';
import { CopyrightTrackController } from './controllers/copyright.track.controller';
import { TrackScanHistory } from './entities/track-scan-history.entity';
import { TrackScanStatus } from './entities/track-scan-status.entity';
import { CopyrightService } from './services/copyright.service';
import { CopyrightAcrService } from './services/sub-services/copyright.acr.service';
import { CopyrightResultService } from './services/sub-services/copyright.result.service';
import { CopyrightTaskService } from './services/sub-services/copyright.task.service';
import { CopyrightTrackService } from './services/sub-services/copyright.track.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([TrackScanHistory, TrackScanStatus, Track]),
		HttpModule,
		BucketModule,
	],
	controllers: [
		CopyrightTrackController,
		CopyrightTaskController,
		CopyrightResultController,
	],
	providers: [
		CopyrightService,

		CopyrightAcrService,
		CopyrightTrackService,
		CopyrightTaskService,
		CopyrightResultService,
	],
	exports: [CopyrightService],
})
export class CopyrightModule {}
