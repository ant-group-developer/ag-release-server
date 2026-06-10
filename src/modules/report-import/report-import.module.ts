import { Module } from '@nestjs/common';
import { ClickHouseModule } from '../clickhouse/clickhouse.module';
import { BucketModule2 } from '../bucket2/bucket2.module';
import { EtlModule } from '../etl/etl.module';
import { DspModule } from '../dsp/dsp.module';
import { ReleaseModule } from '../release/release.module';
import { ReportImportController } from './controllers/report-import.controller';
import { ReportImportService } from './services/report-import.service';
import { ReportDetectorService } from './services/report-detector.service';
import { ReportImportQueueService } from './services/report-import-queue.service';
import { ReportImportWorkerService } from './services/report-import-worker.service';
import { ConfigSyncService } from './services/config-sync.service';

@Module({
  imports: [ClickHouseModule, BucketModule2, EtlModule, DspModule, ReleaseModule],
  controllers: [ReportImportController],
  providers: [
    ReportImportService,
    ReportDetectorService,
    ReportImportQueueService,
    ReportImportWorkerService,
    ConfigSyncService,
  ],
  exports: [ReportImportService],
})
export class ReportImportModule {}
