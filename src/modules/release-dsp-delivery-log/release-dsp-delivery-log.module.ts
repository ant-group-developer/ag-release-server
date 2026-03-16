import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Dsp } from '../dsp/entities/dsp.entity';
import { Release } from '../release/entities/release.entity';
import { ReleaseDspDeliveryLog } from './entities/release-dsp-delivery-log.entity';
import { ReleaseDspDeliveryLogController } from './release-dsp-delivery-log.controller';
import { ReleaseDspDeliveryLogService } from './release-dsp-delivery-log.service';

@Module({
	imports: [TypeOrmModule.forFeature([ReleaseDspDeliveryLog, Release, Dsp])],
	controllers: [ReleaseDspDeliveryLogController],
	providers: [ReleaseDspDeliveryLogService],
	exports: [ReleaseDspDeliveryLogService],
})
export class ReleaseDspDeliveryLogModule {}
