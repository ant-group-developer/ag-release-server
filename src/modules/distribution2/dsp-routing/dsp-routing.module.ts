// src/modules/distribution/dsp-routing/dsp-routing.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryConfigModule } from '../delivery-config/delivery-config.module';
import { DspRoutingController } from './dsp-routing.controller';
import { DspRoutingSetting } from './entities/dsp-routing-setting.entity';
import { DspRoutingQueryService } from './services/dsp-routing.query.service';
import { DspRoutingService } from './services/dsp-routing.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([DspRoutingSetting]),
		DeliveryConfigModule,
	],
	controllers: [DspRoutingController],
	providers: [DspRoutingService, DspRoutingQueryService],
	exports: [DspRoutingService, DspRoutingQueryService],
})
export class DspRoutingModule {}
