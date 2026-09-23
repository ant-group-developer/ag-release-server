import { Injectable } from '@nestjs/common';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { Release } from 'src/modules/release/entities/release.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { EntityManager, Repository } from 'typeorm';
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
		@InjectEntityManager()
		private readonly manager: EntityManager,
	) {}

	async queueExecution(body: {
		release: Release;
		dspCodes: string[];
		type: ExecutionType;
		creatorId?: string | null;
	}) {
		const tenant = await this.manager.findOne(Tenant, {
			where: { id: body.release.tenantId },
		});

		if (!tenant) {
			throw new Error(`Tenant not found: ${body.release.tenantId}`);
		}
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
						reviewPolicy: {
							tenantId: tenant.id,
							requiresManualReview:
								tenant.requiresManualReview === true,
						},
					},
				},
				creatorId: body.creatorId ?? null,
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
