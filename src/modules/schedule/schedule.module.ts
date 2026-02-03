import { Module } from '@nestjs/common';
import { ScheduleModule as ScheduleModuleNestJS } from '@nestjs/schedule';
import { AppConfigModule } from '../app-config/app-config.module';
import { DatabaseModule } from '../database/database.module';
import { ScheduleService } from './schedule.service';

@Module({
	imports: [ScheduleModuleNestJS.forRoot(), DatabaseModule, AppConfigModule],
	providers: [ScheduleService],
})
export class ScheduleModule {}
