import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule } from '../bucket/bucket.module';
import { DspActionModule } from '../dsp-action/dsp-action.module';
import { DspAction } from '../dsp-action/entities/dsp-action.entities';
import { DspController } from './dsp.controller';
import { Dsp } from './entities/dsp.entity';
import { DspQueryService } from './services/dsp.query.service';
import { DspService } from './services/dsp.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([Dsp, DspAction]),
		BucketModule,
		DspActionModule,
	],
	controllers: [DspController],
	providers: [DspService, DspQueryService],
	exports: [DspService, DspQueryService],
})
export class DspModule {}
