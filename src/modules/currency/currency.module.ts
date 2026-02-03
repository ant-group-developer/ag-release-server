import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrencyController } from './currency.controller';
import { Currency } from './entities/currency.entity';
import { CurrencyQueryService } from './services/currency.query.service';
import { CurrencyService } from './services/currency.service';

@Module({
	imports: [TypeOrmModule.forFeature([Currency])],
	controllers: [CurrencyController],
	providers: [CurrencyService, CurrencyQueryService],
	exports: [CurrencyService],
})
export class CurrencyModule {}
