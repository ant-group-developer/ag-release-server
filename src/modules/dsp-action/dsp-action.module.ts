import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Action } from '../action/entities/action.entity';
import { Dsp } from '../dsp/entities/dsp.entity';
import { DspAction } from './entities/dsp-action.entities';
import { DspActionQueryService } from './services/dsp-action.query.service';
import { DspActionService } from './services/dsp-action.service';

@Module({
	imports: [TypeOrmModule.forFeature([DspAction, Dsp, Action])],
	controllers: [],
	providers: [DspActionService, DspActionQueryService],
	exports: [DspActionService],
})
export class DspActionModule {}
