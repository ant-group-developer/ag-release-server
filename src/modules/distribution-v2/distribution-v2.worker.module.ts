import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { envValidationSchema } from 'src/common/config/env.validation.schema';
import { DspRoutingConfig } from 'src/modules/distribution/dsp-routing/entities/dsp-routing-config.entity';
import { AppConfigModule } from '../app-config/app-config.module';
import { BucketModule2 } from '../bucket2/bucket2.module';
import { Cache2Module } from '../cache2/cache2.module';
import { DatabaseModule } from '../database/database.module';
import { IsrcModule } from '../external/isrc/isrc.module';
import { UpcModule } from '../external/upc/upc.module';
import { CiModule } from '../partners-api/ci/ci.module';
import { DistributionV2CiService } from './application/distribution-v2-ci.service';
import { DistributionV2ProvisioningService } from './application/distribution-v2-provisioning.service';
import { DISTRIBUTION_V2_CI_IMPORT_QA } from './application/ports/ci-import-qa.port';
import { DISTRIBUTION_V2_IDENTIFIER_PROVISIONER } from './application/ports/identifier-provisioner.port';
import {
	DISTRIBUTION_V2_PACKAGE_ASSET_READER,
	DISTRIBUTION_V2_PACKAGE_BUILDER,
	DISTRIBUTION_V2_PACKAGE_STORE,
} from './application/ports/package-builder.port';
import {
	DISTRIBUTION_V2_SFTP_CLIENT_FACTORY,
	DISTRIBUTION_V2_SFTP_CONFIG_RESOLVER,
	DISTRIBUTION_V2_SFTP_TRANSPORT,
} from './application/ports/sftp-delivery.port';
import { DistributionV2ConfigService } from './config/distribution-v2.config.service';
import { ChannelDeliveryV2 } from './entities/channel-delivery-v2.entity';
import { DistributionEventV2 } from './entities/distribution-event-v2.entity';
import { DistributionSummaryV2 } from './entities/distribution-summary-v2.entity';
import { DistributionV2 } from './entities/distribution-v2.entity';
import { ExportBatchMemberV2 } from './entities/export-batch-member-v2.entity';
import { ExportBatchV2 } from './entities/export-batch-v2.entity';
import { ExternalOperationV2 } from './entities/external-operation-v2.entity';
import { IdentifierAssignmentV2 } from './entities/identifier-assignment-v2.entity';
import { IssueV2 } from './entities/issue-v2.entity';
import { OutboxEventV2 } from './entities/outbox-event-v2.entity';
import { ReleaseSnapshotV2 } from './entities/release-snapshot-v2.entity';
import { StepRunV2 } from './entities/step-run-v2.entity';
import { SubmitIdempotencyV2 } from './entities/submit-idempotency-v2.entity';
import { DistributionV2CiAdapter } from './infrastructure/ci/distribution-v2-ci.adapter';
import { DistributionV2IdentifierProvisionerAdapter } from './infrastructure/identifier/distribution-v2-identifier-provisioner.adapter';
import { DistributionV2PackageAssetReader } from './infrastructure/package/distribution-v2-package-asset.reader';
import { DistributionV2PackageBuilder } from './infrastructure/package/distribution-v2-package.builder';
import { DistributionV2PackageStore } from './infrastructure/package/distribution-v2-package.store';
import { DistributionV2QueueService } from './infrastructure/queue/distribution-v2.queue.service';
import { DistributionV2OutboxRelay } from './infrastructure/relay/distribution-v2-outbox.relay';
import { DistributionV2SftpConfigResolverImpl } from './infrastructure/sftp/distribution-v2-sftp-config.resolver';
import {
	DistributionV2SftpClientFactoryImpl,
	DistributionV2SftpTransportImpl,
} from './infrastructure/sftp/distribution-v2-sftp.transport';
import { DistributionV2BuildPackageWorker } from './infrastructure/worker/distribution-v2-build-package.worker';
import { DistributionV2CiImportCheckWorker } from './infrastructure/worker/distribution-v2-ci-import-check.worker';
import { DistributionV2CiQaCheckWorker } from './infrastructure/worker/distribution-v2-ci-qa-check.worker';
import { DistributionV2ProvisionIdWorker } from './infrastructure/worker/distribution-v2-provision-id.worker';
import { DistributionV2SftpUploadWorker } from './infrastructure/worker/distribution-v2-sftp-upload.worker';

const DISTRIBUTION_V2_ENTITIES = [
	DistributionV2,
	ReleaseSnapshotV2,
	ChannelDeliveryV2,
	StepRunV2,
	DistributionEventV2,
	OutboxEventV2,
	ExternalOperationV2,
	ExportBatchV2,
	ExportBatchMemberV2,
	IssueV2,
	DistributionSummaryV2,
	SubmitIdempotencyV2,
	IdentifierAssignmentV2,
	DspRoutingConfig,
];

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			validationSchema: envValidationSchema,
		}),
		DatabaseModule,
		BucketModule2,
		Cache2Module,
		AppConfigModule,
		CiModule,
		UpcModule,
		IsrcModule,
		TypeOrmModule.forFeature(DISTRIBUTION_V2_ENTITIES),
	],
	providers: [
		DistributionV2ConfigService,
		DistributionV2QueueService,
		DistributionV2ProvisioningService,
		DistributionV2IdentifierProvisionerAdapter,
		DistributionV2ProvisionIdWorker,
		DistributionV2PackageStore,
		DistributionV2PackageAssetReader,
		DistributionV2PackageBuilder,
		DistributionV2BuildPackageWorker,
		DistributionV2CiAdapter,
		DistributionV2CiService,
		DistributionV2CiImportCheckWorker,
		DistributionV2CiQaCheckWorker,
		DistributionV2SftpConfigResolverImpl,
		DistributionV2SftpClientFactoryImpl,
		DistributionV2SftpTransportImpl,
		DistributionV2SftpUploadWorker,
		DistributionV2OutboxRelay,
		{
			provide: DISTRIBUTION_V2_CI_IMPORT_QA,
			useExisting: DistributionV2CiAdapter,
		},
		{
			provide: DISTRIBUTION_V2_IDENTIFIER_PROVISIONER,
			useExisting: DistributionV2IdentifierProvisionerAdapter,
		},
		{
			provide: DISTRIBUTION_V2_PACKAGE_STORE,
			useExisting: DistributionV2PackageStore,
		},
		{
			provide: DISTRIBUTION_V2_PACKAGE_ASSET_READER,
			useExisting: DistributionV2PackageAssetReader,
		},
		{
			provide: DISTRIBUTION_V2_PACKAGE_BUILDER,
			useExisting: DistributionV2PackageBuilder,
		},
		{
			provide: DISTRIBUTION_V2_SFTP_CONFIG_RESOLVER,
			useExisting: DistributionV2SftpConfigResolverImpl,
		},
		{
			provide: DISTRIBUTION_V2_SFTP_CLIENT_FACTORY,
			useExisting: DistributionV2SftpClientFactoryImpl,
		},
		{
			provide: DISTRIBUTION_V2_SFTP_TRANSPORT,
			useExisting: DistributionV2SftpTransportImpl,
		},
	],
	exports: [
		DistributionV2ConfigService,
		DistributionV2QueueService,
		DistributionV2ProvisioningService,
		DistributionV2CiService,
	],
})
export class DistributionV2WorkerModule {}
