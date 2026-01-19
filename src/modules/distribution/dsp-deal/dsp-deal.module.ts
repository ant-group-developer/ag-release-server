import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DspDealsController } from './dsp-deal.controller';
import { DspDealEntity } from './entities/dsp-deal.entity';
import { DspDealsQueryService } from './services/dsp-deal.query.service';
import { DspDealsService } from './services/dsp-deal.service';

@Module({
	imports: [TypeOrmModule.forFeature([DspDealEntity])],
	controllers: [DspDealsController],
	providers: [DspDealsService, DspDealsQueryService],
	exports: [DspDealsService],
})
export class DspDealsModule {}
