import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule } from '../bucket/bucket.module';
import { DspController } from './dsp.controller';
import { Dsp } from './entities/dsp.entity';
import { DspQueryService } from './services/dsp.query.service';
import { DspService } from './services/dsp.service';

@Module({
	imports: [TypeOrmModule.forFeature([Dsp]), BucketModule],
	controllers: [DspController],
	providers: [DspService, DspQueryService],
})
export class DspModule { }
