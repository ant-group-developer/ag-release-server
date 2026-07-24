import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '../app-config/app-config.module';
import { BucketModule2 } from '../bucket2/bucket2.module';
import { Aggregator } from '../distribution/aggregator/entities/aggregator.entity';
import { DspRoutingConfigsModule } from '../distribution/dsp-routing/dsp-routing.module';
import { SftpConnectModule } from '../distribution/sftp-connect/sftp-connect.module';
import { ErnModule2 } from '../ern2/ern.module';
import { IsrcModule } from '../external/isrc/isrc.module';
import { UpcModule } from '../external/upc/upc.module';
import { NotificationModule } from '../notification/notification.module';
import { CiModule } from '../partners-api/ci/ci.module';
import { Release } from '../release/entities/release.entity';
import { ReleaseModule } from '../release/release.module';
import { Tenant } from '../tenant/tenant.entity';
import { TenantModule } from '../tenant/tenant.module';
import { DistributionCommandService } from './application/distribution-command.service';
import { OrchestrateHandler } from './application/orchestrate.handler';
import {
	DefaultPolicyResolver,
	POLICY_RESOLVER,
} from './application/policy-resolver';
import { CLOCK } from './application/ports/clock.port.token';
import { DISTRIBUTION_REPOSITORY } from './application/ports/distribution-repository.port';
import { DSP_SPEC_RESOLVER } from './application/ports/dsp-spec-resolver.port';
import { RELEASE_SNAPSHOT_READER } from './application/ports/release-snapshot-reader.port';
import { RELEASE_SNAPSHOT_WRITER } from './application/ports/release-snapshot-writer.port';
import { REVIEW_REPOSITORY } from './application/ports/review-repository.port';
import { TENANT_READER } from './application/ports/tenant-reader.port';
import { UNIT_OF_WORK } from './application/ports/unit-of-work.port';
import { WORKFLOW_ENGINE } from './application/ports/workflow-engine.port';
import { ReleaseDspDeliveryProjection } from './application/projection/release-dsp-delivery.projection';
import { DistributionChannelQueryService } from './application/queries/distribution-channel-query.service';
import { DistributionListQueryService } from './application/queries/distribution-list-query.service';
import { DistributionTicketQueryService } from './application/queries/distribution-ticket-query.service';
import { DistributionTimelineQueryService } from './application/queries/distribution-timeline-query.service';
import {
	BuildPackageRunner,
	PACKAGE_BUILDER,
} from './application/step-runners/build-package.runner';
import {
	CiImportCheckRunner,
	INGEST_RESULT_READER,
} from './application/step-runners/ci-import-check.runner';
import {
	EXPORTER,
	ExportBatchRunner,
} from './application/step-runners/export-batch.runner';
import {
	IDENTIFIER_PROVISIONER,
	ProvisionIdRunner,
} from './application/step-runners/provision-id.runner';
import { QA_CHECKER, QaRunner } from './application/step-runners/qa.runner';
import {
	PACKAGE_UPLOADER,
	SftpUploadRunner,
} from './application/step-runners/sftp-upload.runner';
import {
	DELIVERY_STATUS_READER,
	StatusSyncRunner,
} from './application/step-runners/status-sync.runner';
import { ValidateRunner } from './application/step-runners/validate.runner';
import { CiDeliverDesireAdapter } from './infrastructure/adapters/ci-deliver-desire.adapter';
import { CiImportAdapter } from './infrastructure/adapters/ci-import.adapter';
import { CiQaAdapter } from './infrastructure/adapters/ci-qa.adapter';
import { DdexXmlPackageBuilder } from './infrastructure/adapters/ddex-xml-package-builder.adapter';
import { DspSpecResolverAdapter } from './infrastructure/adapters/dsp-spec-resolver.adapter';
import { ExporterAdapter } from './infrastructure/adapters/exporter.adapter';
import { GrpcIdentifierAdapter } from './infrastructure/adapters/grpc-identifier.adapter';
import {
	PostgresTicketAdapter,
	TICKET_SERVICE,
} from './infrastructure/adapters/postgres-ticket.adapter';
import { ReleaseSnapshotWriterAdapter } from './infrastructure/adapters/release-snapshot-writer.adapter';
import { ReleaseSnapshotReaderAdapter } from './infrastructure/adapters/release-snapshot.reader';
import { SftpUploaderAdapter } from './infrastructure/adapters/sftp-uploader.adapter';
import { TenantReaderAdapter } from './infrastructure/adapters/tenant.reader';
import { CiApiModule } from './infrastructure/ci-api/ci-api.module';
import { SystemClock } from './infrastructure/clock/system-clock.adapter';
import { DistributionCommandController } from './infrastructure/http/distribution-command.controller';
import { DistributionController } from './infrastructure/http/distribution.controller';
import { ChannelDeliveryOrmEntity } from './infrastructure/persistence/channel-delivery.orm-entity';
import { DistributionEventOrmEntity } from './infrastructure/persistence/distribution-event.orm-entity';
import { DistributionOrmEntity } from './infrastructure/persistence/distribution.orm-entity';
import { TypeOrmDistributionRepository } from './infrastructure/persistence/distribution.repository';
import { OrchestrationTicketOrmEntity } from './infrastructure/persistence/orchestration-ticket.orm-entity';
import { OutboxEventOrmEntity } from './infrastructure/persistence/outbox-event.orm-entity';
import { ReleaseSnapshotOrmEntity } from './infrastructure/persistence/release-snapshot.orm-entity';
import { ReviewOrmEntity } from './infrastructure/persistence/review.orm-entity';
import { TypeOrmReviewRepository } from './infrastructure/persistence/review.repository';
import { StepErrorRecorder } from './infrastructure/persistence/step-error-recorder';
import { TypeOrmUnitOfWork } from './infrastructure/persistence/typeorm-unit-of-work.adapter';
import { OutboxRelay } from './infrastructure/relay/outbox-relay';
import { DistributionSseService } from './infrastructure/sse/distribution-sse.service';
import { BullMqWorkflowAdapter } from './infrastructure/workflow/bullmq-workflow.adapter';
import { DistributionWorkerService } from './infrastructure/workflow/distribution-worker.service';
import { RunnerDispatchMap } from './infrastructure/workflow/runner-dispatch-map';

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
 *   · IDENTIFIER_PROVISIONER   → GrpcIdentifierAdapter (Group D) ✅ WIRED
 *   · PACKAGE_UPLOADER         → SftpUploaderAdapter (Group D) ✅ WIRED
 *   · EXPORTER                 → ExporterAdapter (Group E) ✅ WIRED
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
			ReviewOrmEntity, // Khối B: audit quyết định duyệt
			Aggregator, // Group E: ExporterAdapter queries State51 aggregator
			Tenant, // ValidateRunner reads tenant.requiresManualReview (Khối B)
			Release, // Command controller resolves tenantId from release for system admin
		]),
		AppConfigModule, // For CI API config + generator config (UPC/ISRC prefix IDs)
		CiModule, // Keep v3 services for backward compatibility
		CiApiModule, // New CI API services for orchestration
		// Group C: DdexXmlPackageBuilder dependencies
		ErnModule2, // ErnService2 — DDEX XML generation
		BucketModule2, // BucketService2 — download audio/cover from cloud
		DspRoutingConfigsModule, // DspRoutingConfigsService — resolve ERN + SFTP config
		// Group D: GrpcIdentifierAdapter + SftpUploaderAdapter dependencies
		UpcModule, // UpcService — gRPC UPC provisioning
		IsrcModule, // IsrcService — gRPC ISRC provisioning
		SftpConnectModule, // SftpConnectService — SFTP/S3 upload
		// Group E: ExporterAdapter dependencies
		NotificationModule, // NotificationResendService — Resend API email
		// Khối A fix: snapshot writer bọc ReleaseQueryService
		ReleaseModule, // ReleaseQueryService — findOneReleaseFull cho snapshot
		// Khối B: tenant-scope cho reviewer (getDescendantIds)
		TenantModule, // TenantService — resolve tenant hierarchy cho RBAC scope
	],
	controllers: [DistributionController, DistributionCommandController],
	providers: [
		{ provide: WORKFLOW_ENGINE, useClass: BullMqWorkflowAdapter },
		{ provide: DSP_SPEC_RESOLVER, useClass: DspSpecResolverAdapter },
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
		{ provide: IDENTIFIER_PROVISIONER, useClass: GrpcIdentifierAdapter },
		{ provide: PACKAGE_UPLOADER, useClass: SftpUploaderAdapter },
		{ provide: EXPORTER, useClass: ExporterAdapter },
		{
			provide: RELEASE_SNAPSHOT_READER,
			useClass: ReleaseSnapshotReaderAdapter,
		},
		{
			provide: RELEASE_SNAPSHOT_WRITER,
			useClass: ReleaseSnapshotWriterAdapter,
		},
		// Khối B: REVIEW gate
		{ provide: REVIEW_REPOSITORY, useClass: TypeOrmReviewRepository },
		{ provide: TENANT_READER, useClass: TenantReaderAdapter },
		// Step runners (consumers for BullMQ jobs)
		BuildPackageRunner,
		ProvisionIdRunner,
		SftpUploadRunner,
		CiImportCheckRunner,
		QaRunner,
		StatusSyncRunner,
		ExportBatchRunner,
		ValidateRunner,
		// Application services
		OrchestrateHandler,
		OutboxRelay,
		DistributionTimelineQueryService,
		DistributionTicketQueryService,
		DistributionListQueryService,
		DistributionChannelQueryService,
		DistributionSseService,
		ReleaseDspDeliveryProjection,
		DistributionCommandService,
		// Khối A: Worker + dispatch
		DistributionWorkerService,
		RunnerDispatchMap,
		StepErrorRecorder,
	],
})
export class DistributionOrchestrationModule {}
