import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '../app-config/app-config.module';
import { AppConfigService } from '../app-config/app-config.service';
import { BucketModule2 } from '../bucket2/bucket2.module';
import { DspRoutingConfigsModule } from '../distribution/dsp-routing/dsp-routing.module';
import { ErnModule2 } from '../ern2/ern.module';
import { CiModule } from '../partners-api/ci/ci.module';
import { OrchestrateHandler } from './application/orchestrate.handler';
import {
	DefaultPolicyResolver,
	POLICY_RESOLVER,
} from './application/policy-resolver';
import { CLOCK } from './application/ports/clock.port.token';
import { DISTRIBUTION_REPOSITORY } from './application/ports/distribution-repository.port';
import { UNIT_OF_WORK } from './application/ports/unit-of-work.port';
import { WORKFLOW_ENGINE } from './application/ports/workflow-engine.port';
import { ReleaseDspDeliveryProjection } from './application/projection/release-dsp-delivery.projection';
import { DistributionTimelineQueryService } from './application/queries/distribution-timeline-query.service';
import { PACKAGE_BUILDER } from './application/step-runners/build-package.runner';
import { INGEST_RESULT_READER } from './application/step-runners/ci-import-check.runner';
import { QA_CHECKER } from './application/step-runners/qa.runner';
import { DELIVERY_STATUS_READER } from './application/step-runners/status-sync.runner';
import { CiDeliverDesireAdapter } from './infrastructure/adapters/ci-deliver-desire.adapter';
import { CiImportAdapter } from './infrastructure/adapters/ci-import.adapter';
import { CiQaAdapter } from './infrastructure/adapters/ci-qa.adapter';
import { DdexXmlPackageBuilder } from './infrastructure/adapters/ddex-xml-package-builder.adapter';
import {
	PostgresTicketAdapter,
	TICKET_SERVICE,
} from './infrastructure/adapters/postgres-ticket.adapter';
import { CI_API_CONFIG } from './infrastructure/ci-api/ci-api.config';
import { CiApiModule } from './infrastructure/ci-api/ci-api.module';
import { SystemClock } from './infrastructure/clock/system-clock.adapter';
import { DistributionController } from './infrastructure/http/distribution.controller';
import { ChannelDeliveryOrmEntity } from './infrastructure/persistence/channel-delivery.orm-entity';
import { DistributionEventOrmEntity } from './infrastructure/persistence/distribution-event.orm-entity';
import { DistributionOrmEntity } from './infrastructure/persistence/distribution.orm-entity';
import { TypeOrmDistributionRepository } from './infrastructure/persistence/distribution.repository';
import { OrchestrationTicketOrmEntity } from './infrastructure/persistence/orchestration-ticket.orm-entity';
import { OutboxEventOrmEntity } from './infrastructure/persistence/outbox-event.orm-entity';
import { ReleaseSnapshotOrmEntity } from './infrastructure/persistence/release-snapshot.orm-entity';
import { TypeOrmUnitOfWork } from './infrastructure/persistence/typeorm-unit-of-work.adapter';
import { OutboxRelay } from './infrastructure/relay/outbox-relay';
import { DistributionSseService } from './infrastructure/sse/distribution-sse.service';
import { BullMqWorkflowAdapter } from './infrastructure/workflow/bullmq-workflow.adapter';

/**
 * DistributionOrchestrationModule — scaffold cho Phase 2 + Phase 4 ACL adapters.
 *
 * Wire ports → adapters:
 *   · WORKFLOW_ENGINE          → BullMqWorkflowAdapter (Step 7 — prod BullMQ)
 *   · UNIT_OF_WORK             → TypeOrmUnitOfWork
 *   · DISTRIBUTION_REPOSITORY  → TypeOrmDistributionRepository
 *   · POLICY_RESOLVER          → DefaultPolicyResolver
 *   · CLOCK                    → SystemClock (prod)
 *
 * Phase 4 ACL adapters (Group A — read-only CI) — REFACTORED:
 *   · INGEST_RESULT_READER     → CiImportAdapter (wraps CiImportApiService)
 *   · QA_CHECKER               → CiQaAdapter (wraps CiQaApiService)
 *   · DELIVERY_STATUS_READER   → CiDeliverDesireAdapter (wraps CiDeliverDesireApiService)
 *
 * CI API Infrastructure:
 *   · CiApiModule              — New dedicated CI API client (separate from v3 partners-api)
 *   · CI_API_CONFIG            — Config provider (baseUrl, organisationId, token, timeout)
 *
 * Infrastructure services:
 *   · OutboxRelay              — Step 6: polling outbox_event → enqueue via WorkflowEnginePort
 *   · ReleaseDspDeliveryProjection — Phase 3 Step 3: CQRS projection event → read model
 *
 * Providers thường:
 *   · OrchestrateHandler       — Step 4: entry point 1 vòng orchestrate
 *
 * Module CHƯA export gì — module khác chưa gọi handler qua DI (Step 7+ mới wire
 * queue consumer). Test unit inject handler trực tiếp qua constructor.
 *
 *   · TICKET_SERVICE           → PostgresTicketAdapter (Group B) ✅ WIRED
 *   · PACKAGE_BUILDER          → DdexXmlPackageBuilder (Group C) ✅ WIRED
 *   · IDENTIFIER_PROVISIONER   → GrpcIdentifierAdapter (Group D)
 *   · PACKAGE_UPLOADER         → SftpUploaderAdapter (Group D)
 *   · EXPORTER                 → ExporterAdapter (Group E)
 */
@Module({
	imports: [
		TypeOrmModule.forFeature([
			DistributionOrmEntity,
			ChannelDeliveryOrmEntity,
			DistributionEventOrmEntity,
			OutboxEventOrmEntity,
			OrchestrationTicketOrmEntity,
			ReleaseSnapshotOrmEntity,
		]),
		AppConfigModule, // For CI API config
		CiModule, // Keep v3 services for backward compatibility
		CiApiModule, // New CI API services for orchestration
		// Group C: DdexXmlPackageBuilder dependencies
		ErnModule2, // ErnService2 — DDEX XML generation
		BucketModule2, // BucketService2 — download audio/cover from cloud
		DspRoutingConfigsModule, // DspRoutingConfigsService — resolve ERN config
	],
	controllers: [DistributionController],
	providers: [
		// CI API Config provider
		{
			provide: CI_API_CONFIG,
			useFactory: (appConfigService: AppConfigService) => ({
				baseUrl: appConfigService.getValue<string>(
					'config.partners.ci.baseUrl',
				),
				organisationId: appConfigService.getValue<string>(
					'config.partners.ci.organisationId',
				),
				token: appConfigService.getValue<string>(
					'config.partners.ci.token',
				),
				timeout: 30000, // 30s timeout per docs
			}),
			inject: [AppConfigService],
		},
		{ provide: WORKFLOW_ENGINE, useClass: BullMqWorkflowAdapter },
		{ provide: UNIT_OF_WORK, useClass: TypeOrmUnitOfWork },
		{
			provide: DISTRIBUTION_REPOSITORY,
			useClass: TypeOrmDistributionRepository,
		},
		{ provide: POLICY_RESOLVER, useClass: DefaultPolicyResolver },
		{ provide: CLOCK, useClass: SystemClock },
		{ provide: INGEST_RESULT_READER, useClass: CiImportAdapter },
		{ provide: QA_CHECKER, useClass: CiQaAdapter },
		{ provide: DELIVERY_STATUS_READER, useClass: CiDeliverDesireAdapter },
		{ provide: TICKET_SERVICE, useClass: PostgresTicketAdapter },
		{ provide: PACKAGE_BUILDER, useClass: DdexXmlPackageBuilder },
		OrchestrateHandler,
		OutboxRelay,
		DistributionTimelineQueryService,
		DistributionSseService,
		ReleaseDspDeliveryProjection,
	],
})
export class DistributionOrchestrationModule {}
