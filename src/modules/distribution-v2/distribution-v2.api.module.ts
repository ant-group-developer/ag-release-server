import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DistributionV2ConfigService } from './config/distribution-v2.config.service';
import { ChannelDeliveryV2 } from './entities/channel-delivery-v2.entity';
import { DistributionEventV2 } from './entities/distribution-event-v2.entity';
import { DistributionSummaryV2 } from './entities/distribution-summary-v2.entity';
import { DistributionV2 } from './entities/distribution-v2.entity';
import { ExportBatchMemberV2 } from './entities/export-batch-member-v2.entity';
import { ExportBatchV2 } from './entities/export-batch-v2.entity';
import { ExternalOperationV2 } from './entities/external-operation-v2.entity';
import { IssueV2 } from './entities/issue-v2.entity';
import { OutboxEventV2 } from './entities/outbox-event-v2.entity';
import { ReleaseSnapshotV2 } from './entities/release-snapshot-v2.entity';
import { StepRunV2 } from './entities/step-run-v2.entity';
import { DistributionV2HealthController } from './interfaces/controllers/distribution-v2-health.controller';

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
];

@Module({
	imports: [TypeOrmModule.forFeature(DISTRIBUTION_V2_ENTITIES)],
	controllers: [DistributionV2HealthController],
	providers: [DistributionV2ConfigService],
	exports: [DistributionV2ConfigService, TypeOrmModule],
})
export class DistributionV2ApiModule {}

