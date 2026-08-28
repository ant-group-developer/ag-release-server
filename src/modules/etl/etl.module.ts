import { Module } from '@nestjs/common';
import { BucketModule2 } from '../bucket2/bucket2.module';
import { ClickHouseModule } from '../clickhouse/clickhouse.module';
import { DspReportModule } from '../dsp-report/dsp-report.module';
import { DspModule } from '../dsp/dsp.module';
import { FtpProviderConfigModule } from '../ftp-provider-config/ftp-provider-config.module';
import { ReleaseModule } from '../release/release.module';
import { ExchangeRateController } from './controllers/exchange-rate.controller';
import { FtpReportFileDiscoveryController } from './controllers/ftp-report-file-discovery.controller';
import { ImportController } from './controllers/import.controller';
import { JobController } from './controllers/job.controller';
import { StatementsUploadController } from './controllers/statements-upload.controller';
import { SyncController } from './controllers/sync.controller';
import { ImportJobsModule } from './import-jobs.module';
import { AnalyticsProjectionRefreshService } from './services/cube-rebuild/analytics-projection-refresh.service';
import { CubeRebuildService } from './services/cube-rebuild/cube-rebuild.service';
import { EtlImportHistoryRepository } from './services/etl-import-history/etl-import-history.repository';
import { ExchangeRateService } from './services/exchange-rate/exchange-rate.service';
import { FtpReportFileDiscoveryService } from './services/ftp/ftp-report-file-discovery.service';
import { FtpService } from './services/ftp/ftp.service';
import { ImportService } from './services/import/import.service';
import { JobService } from './services/job/job.service';
import { SchedulerService } from './services/scheduler/scheduler.service';
import { StatementsImportService } from './services/statements/statements-import.service';
import { StatementsResolverService } from './services/statements/statements-resolver.service';
import { FtpSyncQueueService } from './services/sync/ftp-sync-queue.service';
import { FtpSyncWorkerService } from './services/sync/ftp-sync-worker.service';
import { SyncService } from './services/sync/sync.service';

@Module({
	imports: [
		DspModule,
		ClickHouseModule,
		DspReportModule,
		ReleaseModule,
		ImportJobsModule,
		BucketModule2,
		FtpProviderConfigModule,
	],
	controllers: [
		ImportController,
		SyncController,
		JobController,
		ExchangeRateController,
		StatementsUploadController,
		FtpReportFileDiscoveryController,
	],
	providers: [
		ImportService,
		FtpService,
		FtpReportFileDiscoveryService,
		SyncService,
		FtpSyncQueueService,
		FtpSyncWorkerService,
		SchedulerService,
		JobService,
		ExchangeRateService,
		CubeRebuildService,
		AnalyticsProjectionRefreshService,
		StatementsResolverService,
		StatementsImportService,
		EtlImportHistoryRepository,
	],
	exports: [
		ImportService,
		SyncService,
		ImportJobsModule,
		ExchangeRateService,
		CubeRebuildService,
		AnalyticsProjectionRefreshService,
		EtlImportHistoryRepository,
	],
})
export class EtlModule {}
