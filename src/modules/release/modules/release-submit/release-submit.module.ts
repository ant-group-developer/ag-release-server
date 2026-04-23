import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DistributionModule } from 'src/modules/distribution/distribution.module';
import { ReleaseModule } from 'src/modules/release/release.module';
import { ReleaseSubmitStep } from './entities/release-submit-step.entity';
import { ReleaseSubmit } from './entities/release-submit.entity';
import { ReleaseSubmitController } from './release-submit.controller';
import { ReleaseSubmitService } from './services/release-submit.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([ReleaseSubmit, ReleaseSubmitStep]),
		ReleaseModule,
		DistributionModule,
	],
	controllers: [ReleaseSubmitController],
	providers: [ReleaseSubmitService],
	exports: [ReleaseSubmitService],
})
export class ReleaseSubmitModule {}
