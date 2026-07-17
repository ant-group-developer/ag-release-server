import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';
import { DISTRIBUTION_REPOSITORY } from './application/ports/distribution-repository.port';
import { UNIT_OF_WORK } from './application/ports/unit-of-work.port';
import { WORKFLOW_ENGINE } from './application/ports/workflow-engine.port';
import { ChannelDeliveryOrmEntity } from './infrastructure/persistence/channel-delivery.orm-entity';
import { DistributionEventOrmEntity } from './infrastructure/persistence/distribution-event.orm-entity';
import { DistributionOrmEntity } from './infrastructure/persistence/distribution.orm-entity';
import { TypeOrmDistributionRepository } from './infrastructure/persistence/distribution.repository';
import { OutboxEventOrmEntity } from './infrastructure/persistence/outbox-event.orm-entity';
import { TypeOrmUnitOfWork } from './infrastructure/persistence/typeorm-unit-of-work.adapter';
import { InMemoryWorkflowAdapter } from './infrastructure/workflow/in-memory-workflow.adapter';

/**
 * DistributionOrchestrationModule — scaffold cho Phase 2.
 *
 * Wire ports → adapters:
 *   · WORKFLOW_ENGINE          → InMemoryWorkflowAdapter (Step 8 swap sang BullMQ)
 *   · UNIT_OF_WORK             → TypeOrmUnitOfWork
 *   · DISTRIBUTION_REPOSITORY  → TypeOrmDistributionRepository (stateless — Nest OK với useClass)
 *
 * Module CHƯA export gì — không có handler/service để module khác gọi vào.
 * Khi có API/controller ở phase sau, thêm exports tương ứng.
 */
@Module({
	imports: [
		TypeOrmModule.forFeature([
			DistributionOrmEntity,
			ChannelDeliveryOrmEntity,
			DistributionEventOrmEntity,
			OutboxEventOrmEntity,
		]),
	],
	providers: [
		{ provide: WORKFLOW_ENGINE, useClass: InMemoryWorkflowAdapter },
		{ provide: UNIT_OF_WORK, useClass: TypeOrmUnitOfWork },
		{
			provide: DISTRIBUTION_REPOSITORY,
			useClass: TypeOrmDistributionRepository,
		},
	],
})
export class DistributionOrchestrationModule {}
