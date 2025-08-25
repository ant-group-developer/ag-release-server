import { Module } from '@nestjs/common';
import { ScheduleModule as ScheduleModuleNestJS } from '@nestjs/schedule';
import { CopyrightModule } from '../copyright/copyright.module';
import { DatabaseModule } from '../database/database.module';
import { ScheduleService } from './schedule.service';

@Module({
	imports: [ScheduleModuleNestJS.forRoot(), DatabaseModule, CopyrightModule],
	providers: [ScheduleService],
})
export class ScheduleModule {}
