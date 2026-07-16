import { Module } from '@nestjs/common';
import { BucketModule2 } from '../bucket2/bucket2.module';
import { ClickHouseModule } from '../clickhouse/clickhouse.module';
import { DspReportModule } from '../dsp-report/dsp-report.module';
import { DspModule } from '../dsp/dsp.module';
import { ReleaseModule } from '../release/release.module';
import { ExchangeRateController } from './controllers/exchange-rate.controller';
import { ImportController } from './controllers/import.controller';
import { JobController } from './controllers/job.controller';
import { StatementsUploadController } from './controllers/statements-upload.controller';
import { SyncController } from './controllers/sync.controller';
import { ImportJobsModule } from './import-jobs.module';
import { CubeRebuildService } from './services/cube-rebuild/cube-rebuild.service';
import { ExchangeRateService } from './services/exchange-rate/exchange-rate.service';
import { FtpService } from './services/ftp/ftp.service';
import { ImportService } from './services/import/import.service';
import { JobService } from './services/job/job.service';
import { SchedulerService } from './services/scheduler/scheduler.service';
import { StatementsImportService } from './services/statements/statements-import.service';
import { StatementsResolverService } from './services/statements/statements-resolver.service';
import { SyncService } from './services/sync/sync.service';

@Module({
	imports: [
		DspModule,
		ClickHouseModule,
		DspReportModule,
		ReleaseModule,
		ImportJobsModule,
		BucketModule2,
	],
	controllers: [
		ImportController,
		SyncController,
		JobController,
		ExchangeRateController,
		StatementsUploadController,
	],
	providers: [
		ImportService,
		FtpService,
		SyncService,
		SchedulerService,
		JobService, // @deprecated — giữ tạm, sẽ remove sau khi confirm không nơi khác inject
		ExchangeRateService,
		CubeRebuildService,
		StatementsResolverService,
		StatementsImportService,
	],
	exports: [
		ImportService,
		SyncService,
		ImportJobsModule,
		ExchangeRateService,
		CubeRebuildService,
	],
})
export class EtlModule {}
