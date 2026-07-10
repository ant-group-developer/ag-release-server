import { Module } from '@nestjs/common';
import { ClickHouseModule } from '../clickhouse/clickhouse.module';
import { ImportJobsService } from './services/import-jobs/import-jobs.service';
import { JobEventsGateway } from './services/import-jobs/job-events.gateway';

@Module({
	imports: [ClickHouseModule],
	providers: [ImportJobsService, JobEventsGateway],
	exports: [ImportJobsService, JobEventsGateway],
})
export class ImportJobsModule {}
