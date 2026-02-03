import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Currency } from '../currency/entities/currency.entity';
import { PriceTier } from './entities/price-tier.entity';
import { PriceTierController } from './price-tier.controller';
import { PriceTierQueryService } from './services/price-tier.query.service';
import { PriceTierService } from './services/price-tier.service';

@Module({
	imports: [TypeOrmModule.forFeature([PriceTier, Currency])],
	controllers: [PriceTierController],
	providers: [PriceTierService, PriceTierQueryService],
	exports: [PriceTierService],
})
export class PriceTierModule {}
