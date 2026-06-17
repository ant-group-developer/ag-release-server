import { Injectable } from '@nestjs/common';
import { CiDistributionJob3Service } from './ci-distribution-job3.service';
import { ReleaseExecution3Consumer } from './queue/release-execution3.consumer';
import { ReleaseExecution3Service } from './release-execution3.service';

@Injectable()
export class ReleaseExecution3CronJobService {
	constructor(
		private readonly releaseExecution3Service: ReleaseExecution3Service,
		private readonly ciDistributionJob3Service: CiDistributionJob3Service,
		private readonly releaseExecution3Consumer: ReleaseExecution3Consumer,
	) {}

	async resumeWaitingSteps() {
		await this.releaseExecution3Service.resumeWaitingSteps();
	}

	async checkCiToolJobStatus() {
		await this.ciDistributionJob3Service.checkCiToolJobStatus();
	}

	async handleDailySend() {
		await this.ciDistributionJob3Service.handleDailySend();
	}

	async consumeExecutions() {
		await this.releaseExecution3Consumer.consumerExecutions();
	}

	async consumeRunPipelineQueue() {
		await this.releaseExecution3Consumer.consumeRunPipelineQueue();
	}
}
