import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dsp } from './entities/dsp.entity';

@Module({
	imports: [TypeOrmModule.forFeature([Dsp])],
})
export class DspModule {}
