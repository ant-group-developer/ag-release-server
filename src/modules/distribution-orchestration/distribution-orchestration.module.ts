import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';
import { OrchestrateHandler } from './application/orchestrate.handler';
import {
	DefaultPolicyResolver,
	POLICY_RESOLVER,
} from './application/policy-resolver';
import { CLOCK } from './application/ports/clock.port.token';
import { DISTRIBUTION_REPOSITORY } from './application/ports/distribution-repository.port';
import { UNIT_OF_WORK } from './application/ports/unit-of-work.port';
import { WORKFLOW_ENGINE } from './application/ports/workflow-engine.port';
import { SystemClock } from './infrastructure/clock/system-clock.adapter';
import { ChannelDeliveryOrmEntity } from './infrastructure/persistence/channel-delivery.orm-entity';
import { DistributionEventOrmEntity } from './infrastructure/persistence/distribution-event.orm-entity';
import { DistributionOrmEntity } from './infrastructure/persistence/distribution.orm-entity';
import { TypeOrmDistributionRepository } from './infrastructure/persistence/distribution.repository';
import { OutboxEventOrmEntity } from './infrastructure/persistence/outbox-event.orm-entity';
import { TypeOrmUnitOfWork } from './infrastructure/persistence/typeorm-unit-of-work.adapter';
import { OutboxRelay } from './infrastructure/relay/outbox-relay';
import { BullMqWorkflowAdapter } from './infrastructure/workflow/bullmq-workflow.adapter';

/**
 * DistributionOrchestrationModule — scaffold cho Phase 2.
 *
 * Wire ports → adapters:
 *   · WORKFLOW_ENGINE          → BullMqWorkflowAdapter (Step 7 — prod BullMQ)
 *   · UNIT_OF_WORK             → TypeOrmUnitOfWork
 *   · DISTRIBUTION_REPOSITORY  → TypeOrmDistributionRepository
 *   · POLICY_RESOLVER          → DefaultPolicyResolver
 *   · CLOCK                    → SystemClock (prod)
 *
 * Infrastructure services:
 *   · OutboxRelay              — Step 6: polling outbox_event → enqueue via WorkflowEnginePort
 *
 * Providers thường:
 *   · OrchestrateHandler       — Step 4: entry point 1 vòng orchestrate
 *
 * Module CHƯA export gì — module khác chưa gọi handler qua DI (Step 7+ mới wire
 * queue consumer). Test unit inject handler trực tiếp qua constructor.
 *
 * Step-runners (Step 5b) KHÔNG wire ở đây — 7 runner cần adapter cho 7 port
 * (IdentifierProvisioner, PackageBuilder, PackageUploader, QaChecker, Exporter,
 * IngestResultReader, DeliveryStatusReader) sẽ có ở Phase 4 (ACL layer). Runner
 * đã Injectable + có DI token — Phase 4 chỉ cần thêm `{provide, useClass}` +
 * đăng ký runner vào providers khi adapter sẵn sàng.
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
		{ provide: WORKFLOW_ENGINE, useClass: BullMqWorkflowAdapter },
		{ provide: UNIT_OF_WORK, useClass: TypeOrmUnitOfWork },
		{
			provide: DISTRIBUTION_REPOSITORY,
			useClass: TypeOrmDistributionRepository,
		},
		{ provide: POLICY_RESOLVER, useClass: DefaultPolicyResolver },
		{ provide: CLOCK, useClass: SystemClock },
		OrchestrateHandler,
		OutboxRelay,
	],
})
export class DistributionOrchestrationModule {}
