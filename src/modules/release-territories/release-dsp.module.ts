import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReleaseDsp } from '../release-dsp/entities/release-dsp.entity';

@Module({
	imports: [TypeOrmModule.forFeature([ReleaseDsp])],
	// controllers: [ReleaseDspController],
	// providers: [ReleaseDspService, ReleaseDspValidateService],
})
export class ReleaseDspModule {}
