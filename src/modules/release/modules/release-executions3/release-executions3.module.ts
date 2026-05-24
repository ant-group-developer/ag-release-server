import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DspRoutingConfigsModule } from 'src/modules/distribution/dsp-routing/dsp-routing.module';
import { SftpConnectModule } from 'src/modules/distribution/sftp-connect/sftp-connect.module';
import { ReleaseExecution3Controller } from './controllers/release-execution3.controller';
import { ReleaseExecutionStepTestController } from './controllers/release-execution3.engine.controller';
import { ReleaseSubmitTestController } from './controllers/release-submit-test.controller';
import { ReleaseExecutionStep3 } from './entites/release-execution3-step.entity';
import { ReleaseExecution3 } from './entites/release-execution3.entity';
import { ReleaseExecution3Builder } from './services/release-execution3.builder';
import { ReleaseExecutionStepEngine } from './services/release-execution3.engine';
import { ReleaseExecution3Service } from './services/release-execution3.service';
import { ReleaseExecution3Worker } from './services/release-execution3.worker';

@Module({
	imports: [
		TypeOrmModule.forFeature([ReleaseExecution3, ReleaseExecutionStep3]),

		DspRoutingConfigsModule,
		SftpConnectModule,
	],
	controllers: [
		ReleaseExecution3Controller,
		ReleaseSubmitTestController,
		ReleaseExecutionStepTestController,
	],
	providers: [
		ReleaseExecution3Builder,
		ReleaseExecutionStepEngine,
		ReleaseExecution3Service,
		ReleaseExecution3Worker,
	],
	exports: [ReleaseExecution3Service],
})
export class ReleaseExecutions3Module {}
