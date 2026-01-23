// src/modules/distribution/delivery-config/delivery-config.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryConfigController } from './delivery-config.controller';
import { DeliveryConfig } from './entities/delivery-config.entity';
import { DeliveryConfigQueryService } from './services/delivery-config.query.service';
import { DeliveryConfigService } from './services/delivery-config.service';

@Module({
	imports: [TypeOrmModule.forFeature([DeliveryConfig])],
	controllers: [DeliveryConfigController],
	providers: [DeliveryConfigService, DeliveryConfigQueryService],
	exports: [DeliveryConfigService, DeliveryConfigQueryService],
})
export class DeliveryConfigModule {}
