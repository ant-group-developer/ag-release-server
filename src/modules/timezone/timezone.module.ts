import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Timezone } from './entities/timezone.entity';
import { TimezoneQueryService } from './services/timezone.query.service';
import { TimezoneService } from './services/timezone.service';
import { TimezoneController } from './timezone.controller';

@Module({
	imports: [TypeOrmModule.forFeature([Timezone])],
	controllers: [TimezoneController],
	providers: [TimezoneService, TimezoneQueryService],
})
export class TimezoneModule {}
