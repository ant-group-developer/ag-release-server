import { Module } from '@nestjs/common';
import { ImportController } from './controllers/import.controller';
import { SyncController } from './controllers/sync.controller';
import { JobController } from './controllers/job.controller';
import { ExchangeRateController } from './controllers/exchange-rate.controller';
import { WmgImportController } from './controllers/wmg-import.controller';
import { ImportService } from './services/import/import.service';
import { FtpService } from './services/ftp/ftp.service';
import { SyncService } from './services/sync/sync.service';
import { SchedulerService } from './services/scheduler/scheduler.service';
import { JobService } from './services/job/job.service';
import { WmgImportService } from './services/import/wmg-import.service';
import { ImportJobsService } from './services/import-jobs/import-jobs.service';
import { ExchangeRateService } from './services/exchange-rate/exchange-rate.service';
import { CubeRebuildService } from './services/cube-rebuild/cube-rebuild.service';
import { DspModule } from '../dsp/dsp.module';
import { ClickHouseModule } from '../clickhouse/clickhouse.module';
import { DspReportModule } from '../dsp-report/dsp-report.module';

@Module({
  imports: [DspModule, ClickHouseModule, DspReportModule],
  controllers: [ImportController, SyncController, JobController, WmgImportController, ExchangeRateController],
  providers: [
    ImportService,
    FtpService,
    SyncService,
    SchedulerService,
    JobService, // @deprecated — giữ tạm, sẽ remove sau khi confirm không nơi khác inject
    ImportJobsService,
    WmgImportService,
    ExchangeRateService,
    CubeRebuildService,
  ],
  exports: [ImportService, SyncService, ImportJobsService, ExchangeRateService, CubeRebuildService],
})
export class EtlModule {}
