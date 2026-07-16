import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';
import { WORKFLOW_ENGINE } from './application/ports/workflow-engine.port';
import { ChannelDeliveryOrmEntity } from './infrastructure/persistence/channel-delivery.orm-entity';
import { DistributionEventOrmEntity } from './infrastructure/persistence/distribution-event.orm-entity';
import { DistributionOrmEntity } from './infrastructure/persistence/distribution.orm-entity';
import { OutboxEventOrmEntity } from './infrastructure/persistence/outbox-event.orm-entity';
import { InMemoryWorkflowAdapter } from './infrastructure/workflow/in-memory-workflow.adapter';

/**
 * DistributionOrchestrationModule — scaffold cho Phase 2.
 *
 * Hiện tại chỉ wire WORKFLOW_ENGINE → InMemoryWorkflowAdapter.
 * Ở Step 8 sẽ swap sang BullMqWorkflowAdapter khi cài bullmq + Redis.
 *
 * UNIT_OF_WORK sẽ thêm ở step kế (cần adapter TypeORM).
 * Handler + repo + step-runners thêm dần trong Phase 2.
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
	],
})
export class DistributionOrchestrationModule {}
