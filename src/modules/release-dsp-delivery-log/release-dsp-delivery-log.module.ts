import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ReleaseDspDeliveryLogService } from './release-dsp-delivery-log.service';
import { ReleaseDspDeliveryLogController } from './release-dsp-delivery-log.controller';
import { ReleaseDspDeliveryLog } from './entities/release-dsp-delivery-log.entity';
import { Dsp } from '../dsp/entities/dsp.entity';
import { Release } from '../release/entities/release.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ReleaseDspDeliveryLog, Release, Dsp])],
  controllers: [ReleaseDspDeliveryLogController],
  providers: [ReleaseDspDeliveryLogService],
  exports: [ReleaseDspDeliveryLogService],
})
export class ReleaseDspDeliveryLogModule { }