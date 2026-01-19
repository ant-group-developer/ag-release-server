import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DspDealConfigsController } from './dsp-deal-config.controller';
import { DspDealConfigEntity } from './entities/dsp-deal-config.entity';
import { DspDealConfigsQueryService } from './services/dsp-deal-config.query.service';
import { DspDealConfigsService } from './services/dsp-deal-config.service';

@Module({
	imports: [TypeOrmModule.forFeature([DspDealConfigEntity])],
	controllers: [DspDealConfigsController],
	providers: [DspDealConfigsService, DspDealConfigsQueryService],
	exports: [DspDealConfigsService],
})
export class DspDealConfigsModule {}
