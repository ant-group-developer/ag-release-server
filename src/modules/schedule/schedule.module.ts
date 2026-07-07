import { Module } from '@nestjs/common';
import { ScheduleModule as ScheduleModuleNestJS } from '@nestjs/schedule';
import { AppConfigModule } from '../app-config/app-config.module';
import { DatabaseModule } from '../database/database.module';
import { DspReportModule } from '../dsp-report/dsp-report.module';
import { ReleaseModule } from '../release/release.module';
import { ScheduleService } from './schedule.service';

@Module({
	imports: [
		ScheduleModuleNestJS.forRoot(),
		DatabaseModule,
		AppConfigModule,
		ReleaseModule,
		DspReportModule,
	],
	providers: [ScheduleService],
})
export class ScheduleModule {}
