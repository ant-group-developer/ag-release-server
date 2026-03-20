// release-dsp-delivery.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReleaseDspDeliveryController } from './controllers/release-dsp-delivery.controller';
import { ReleaseDspDelivery } from './entities/release-dsp-delivery.entity';
import { ReleaseDspDeliveryQueryService } from './services/release-dsp-delivery-query.service';
import { ReleaseDspDeliveryService } from './services/release-dsp-delivery.service';

@Module({
	imports: [TypeOrmModule.forFeature([ReleaseDspDelivery])],
	controllers: [ReleaseDspDeliveryController],
	providers: [ReleaseDspDeliveryService, ReleaseDspDeliveryQueryService],
	exports: [ReleaseDspDeliveryService],
})
export class ReleaseDspDeliveryModule {}
