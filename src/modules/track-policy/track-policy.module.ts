import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Action } from '../action/entities/action.entity';
import { Dsp } from '../dsp/entities/dsp.entity';
import { TrackPolicy } from './entities/track-policy.entity';
import { TrackPolicyDspService } from './services/track-policy.dsp-service';
import { TrackPolicyService } from './services/track-policy.service';

@Module({
	imports: [TypeOrmModule.forFeature([TrackPolicy, Dsp, Action])],
	controllers: [],
	providers: [TrackPolicyService, TrackPolicyDspService],
	exports: [TrackPolicyService],
})
export class TrackPolicyModule {}
