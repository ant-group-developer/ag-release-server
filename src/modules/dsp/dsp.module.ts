import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule } from '../bucket/bucket.module';
import { DspController } from './dsp.controller';
import { DspService } from './dsp.service';
import { Dsp } from './entities/dsp.entity';

@Module({
	imports: [TypeOrmModule.forFeature([Dsp]), BucketModule],
	controllers: [DspController],
	providers: [DspService],
})
export class DspModule {}
