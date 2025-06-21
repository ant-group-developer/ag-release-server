import { Module } from '@nestjs/common';
import { ScheduleModule as ScheduleModuleNestJS } from '@nestjs/schedule';
import { DatabaseModule } from '../database/database.module';
import { ScheduleService } from './schedule.service';

@Module({
	imports: [ScheduleModuleNestJS.forRoot(), DatabaseModule],
	providers: [ScheduleService],
})
export class ScheduleModule {}
