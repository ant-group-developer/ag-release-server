import { Module } from '@nestjs/common';
import { ImportController } from './controllers/import.controller';
import { SyncController } from './controllers/sync.controller';
import { JobController } from './controllers/job.controller';
import { ExchangeRateController } from './controllers/exchange-rate.controller';
import { ImportService } from './services/import/import.service';
import { FtpService } from './services/ftp/ftp.service';
import { SyncService } from './services/sync/sync.service';
import { SchedulerService } from './services/scheduler/scheduler.service';
import { JobService } from './services/job/job.service';
import { ExchangeRateService } from './services/exchange-rate/exchange-rate.service';
import { CubeRebuildService } from './services/cube-rebuild/cube-rebuild.service';
import { DspModule } from '../dsp/dsp.module';
import { ClickHouseModule } from '../clickhouse/clickhouse.module';
import { DspReportModule } from '../dsp-report/dsp-report.module';
import { ReleaseModule } from '../release/release.module';
import { ImportJobsModule } from './import-jobs.module';

@Module({
  imports: [DspModule, ClickHouseModule, DspReportModule, ReleaseModule, ImportJobsModule],
  controllers: [ImportController, SyncController, JobController, ExchangeRateController],
  providers: [
    ImportService,
    FtpService,
    SyncService,
    SchedulerService,
    JobService, // @deprecated — giữ tạm, sẽ remove sau khi confirm không nơi khác inject
    ExchangeRateService,
    CubeRebuildService,
  ],
  exports: [ImportService, SyncService, ImportJobsModule, ExchangeRateService, CubeRebuildService],
})
export class EtlModule {}
