import { Module } from '@nestjs/common';
import { ImportController } from './controllers/import.controller';
import { SyncController } from './controllers/sync.controller';
import { JobController } from './controllers/job.controller';
import { ImportService } from './services/import/import.service';
import { FtpService } from './services/ftp/ftp.service';
import { SyncService } from './services/sync/sync.service';
import { SchedulerService } from './services/scheduler/scheduler.service';
import { JobService } from './services/job/job.service';

@Module({
  controllers: [ImportController, SyncController, JobController],
  providers: [ImportService, FtpService, SyncService, SchedulerService, JobService],
  exports: [ImportService, SyncService],
})
export class EtlModule {}
