import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule } from '../bucket/bucket.module';
import { DspController } from './dsp.controller';
import { Dsp } from './entities/dsp.entity';
import { DspQbService } from './services/dsp.qb.service';
import { DspService } from './services/dsp.service';

@Module({
	imports: [TypeOrmModule.forFeature([Dsp]), BucketModule],
	controllers: [DspController],
	providers: [DspService, DspQbService],
})
export class DspModule {}
