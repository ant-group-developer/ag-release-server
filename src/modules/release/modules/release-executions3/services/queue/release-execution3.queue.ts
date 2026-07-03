import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Release } from 'src/modules/release/entities/release.entity';
import { Repository } from 'typeorm';
import { ReleaseExecution3 } from '../../entites/release-execution3.entity';
import {
	ReleaseExecution3RunPipelineQueue,
	RunPipelineQueueStatus,
} from '../../entites/release-execution3.queue.entity';
import {
	ExecutionType,
	ReleaseExecutionStatus,
} from '../../enums/release-execution3.enum';

@Injectable()
export class ReleaseExecution3Queue {
	constructor(
		@InjectRepository(ReleaseExecution3RunPipelineQueue)
		private readonly runPipelineQueueRepo: Repository<ReleaseExecution3RunPipelineQueue>,

		@InjectRepository(ReleaseExecution3)
		private readonly executionRepo: Repository<ReleaseExecution3>,

		// @Inject(forwardRef(() => ReleaseExecution3Service))
		// private readonly executionService: ReleaseExecution3Service,
	) {}

	async queueExecution(body: {
		release: Release;
		dspCodes: string[];
		type: ExecutionType;
	}) {
		// const execution =
		await this.executionRepo.save(
			this.executionRepo.create({
				releaseId: body.release.id,
				type: body.type,
				status: ReleaseExecutionStatus.NEW,
				releaseTitle: body.release.title,
				releaseUpc: body.release.upc ?? '',
				metadata: {
					input: {
						releaseSnapshot: body.release,
						dspCodes: body.dspCodes,
					},
				},
			}),
		);

		// await this.executionService.startProcessing(execution.id);
		// return execution;
	}

	async queueRunPipeline(releaseExecutionId: string) {
		return this.runPipelineQueueRepo.save(
			this.runPipelineQueueRepo.create({
				releaseExecutionId,
				status: RunPipelineQueueStatus.NEW,
			}),
		);
		// await this.executionService.runPipeline(releaseExecutionId);
	}
}
