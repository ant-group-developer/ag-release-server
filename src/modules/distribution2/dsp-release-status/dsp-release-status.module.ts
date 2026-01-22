// src/modules/distribution/dsp-release-status/dsp-release-status.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DspReleaseStatusController } from './dsp-release-status.controller';
import { DspReleaseStatus } from './entities/dsp-release-status.entity';
import { DspReleaseStatusQueryService } from './services/dsp-release-status.query.service';
import { DspReleaseStatusService } from './services/dsp-release-status.service';

@Module({
	imports: [TypeOrmModule.forFeature([DspReleaseStatus])],
	controllers: [DspReleaseStatusController],
	providers: [DspReleaseStatusService, DspReleaseStatusQueryService],
	exports: [DspReleaseStatusService, DspReleaseStatusQueryService],
})
export class DspReleaseStatusModule {}
