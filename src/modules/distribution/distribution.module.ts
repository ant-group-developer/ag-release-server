import { Module } from '@nestjs/common';
import { DealTypeModule } from './deal-type/deal-type.module';
import { DspDealsModule } from './dsp-deal/dsp-deal.module';

@Module({
	imports: [DealTypeModule, DspDealsModule],
})
export class DistributionModule {}
