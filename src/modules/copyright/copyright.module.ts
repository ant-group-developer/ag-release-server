import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule } from '../bucket/bucket.module';
import { Track } from '../track/entities/track.entity';
import { CopyrightFilterController } from './controllers/copyright.filter.controller';
import { CopyrightTrackController } from './controllers/copyright.track.controller';
import { TrackScanHistory } from './entities/track-scan-history.entity';
import { TrackScanStatus } from './entities/track-scan-status.entity';
import { CopyrightService } from './services/copyright.service';
import { CopyrightAcrService } from './services/sub-services/copyright.acr.service';
import { CopyrightFilterService } from './services/sub-services/copyright.filter.service';
import { CopyrightResultService } from './services/sub-services/copyright.result.service';
import { CopyrightTrackService } from './services/sub-services/copyright.track.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([TrackScanHistory, TrackScanStatus, Track]),
		HttpModule,
		BucketModule,
	],
	controllers: [CopyrightTrackController, CopyrightFilterController],
	providers: [
		CopyrightService,

		CopyrightAcrService,
		CopyrightTrackService,
		CopyrightFilterService,
		CopyrightResultService,
	],
	exports: [],
})
export class CopyrightModule {}
