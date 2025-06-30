import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DspController } from './dsp.controller';
import { DspService } from './dsp.service';
import { Dsp } from './entities/dsp.entity';

@Module({
	imports: [TypeOrmModule.forFeature([Dsp])],
	controllers: [DspController],
	providers: [DspService],
})
export class DspModule {}
