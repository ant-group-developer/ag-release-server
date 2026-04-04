// release-dsp-delivery.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReleaseDspDeliveryController } from './controllers/release-dsp-delivery.controller';
import { ReleaseDspDelivery } from './entities/release-dsp-delivery.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { ReleaseDspDeliveryQueryService } from './services/release-dsp-delivery-query.service';
import { ReleaseDspDeliveryService } from './services/release-dsp-delivery.service';

@Module({
	imports: [TypeOrmModule.forFeature([ReleaseDspDelivery, Dsp])],
	controllers: [ReleaseDspDeliveryController],
	providers: [ReleaseDspDeliveryService, ReleaseDspDeliveryQueryService],
	exports: [ReleaseDspDeliveryService, ReleaseDspDeliveryQueryService],
})
export class ReleaseDspDeliveryModule {}
