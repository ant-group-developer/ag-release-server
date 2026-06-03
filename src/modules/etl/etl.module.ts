import { Module } from '@nestjs/common';
import { ImportController } from './controllers/import.controller';
import { SyncController } from './controllers/sync.controller';
import { JobController } from './controllers/job.controller';
import { WmgImportController } from './controllers/wmg-import.controller';
import { ImportService } from './services/import/import.service';
import { FtpService } from './services/ftp/ftp.service';
import { SyncService } from './services/sync/sync.service';
import { SchedulerService } from './services/scheduler/scheduler.service';
import { JobService } from './services/job/job.service';
import { WmgImportService } from './services/import/wmg-import.service';
import { ImportJobsService } from './services/import-jobs/import-jobs.service';
import { DspModule } from '../dsp/dsp.module';
import { ClickHouseModule } from '../clickhouse/clickhouse.module';

@Module({
  imports: [DspModule, ClickHouseModule],
  controllers: [ImportController, SyncController, JobController, WmgImportController],
  providers: [
    ImportService,
    FtpService,
    SyncService,
    SchedulerService,
    JobService, // @deprecated — giữ tạm, sẽ remove sau khi confirm không nơi khác inject
    ImportJobsService,
    WmgImportService,
  ],
  exports: [ImportService, SyncService, ImportJobsService],
})
export class EtlModule {}
