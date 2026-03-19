import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule2 } from '../bucket2/bucket2.module';
import { DspRoutingConfigsModule } from '../distribution/dsp-routing/dsp-routing.module';
import { DspActionModule } from '../dsp-action/dsp-action.module';
import { DspAction } from '../dsp-action/entities/dsp-action.entities';
import { DspController } from './dsp.controller';
import { Dsp } from './entities/dsp.entity';
import { DspQueryService } from './services/dsp.query.service';
import { DspService } from './services/dsp.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([Dsp, DspAction]),
		BucketModule2,
		DspActionModule,
		DspRoutingConfigsModule,
	],
	controllers: [DspController],
	providers: [DspService, DspQueryService],
	exports: [DspService, DspQueryService],
})
export class DspModule {}
