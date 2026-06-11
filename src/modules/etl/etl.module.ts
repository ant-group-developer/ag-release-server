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
import { ImportJobsService } from './services/import-jobs/import-jobs.service';
import { JobEventsGateway } from './services/import-jobs/job-events.gateway';
import { ExchangeRateService } from './services/exchange-rate/exchange-rate.service';
import { CubeRebuildService } from './services/cube-rebuild/cube-rebuild.service';
import { DspModule } from '../dsp/dsp.module';
import { ClickHouseModule } from '../clickhouse/clickhouse.module';
import { DspReportModule } from '../dsp-report/dsp-report.module';
import { ReleaseModule } from '../release/release.module';

@Module({
  imports: [DspModule, ClickHouseModule, DspReportModule, ReleaseModule],
  controllers: [ImportController, SyncController, JobController, ExchangeRateController],
  providers: [
    ImportService,
    FtpService,
    SyncService,
    SchedulerService,
    JobService, // @deprecated — giữ tạm, sẽ remove sau khi confirm không nơi khác inject
    ImportJobsService,
    JobEventsGateway,
    ExchangeRateService,
    CubeRebuildService,
  ],
  exports: [ImportService, SyncService, ImportJobsService, JobEventsGateway, ExchangeRateService, CubeRebuildService],
})
export class EtlModule {}
