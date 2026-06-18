import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClickHouseModule } from '../clickhouse/clickhouse.module';
import { BucketModule2 } from '../bucket2/bucket2.module';
import { EtlModule } from '../etl/etl.module';
import { DspModule } from '../dsp/dsp.module';
import { ReleaseModule } from '../release/release.module';
import { SpotifyModule } from '../partners-api/spotify/spotify.module';
import { Label } from '../label/entities/label.entity';
import { ReportImportController } from './controllers/report-import.controller';
import { ReportSourceConfigController } from './controllers/report-source-config.controller';
import { ReportImportService } from './services/report-import.service';
import { ReportDetectorService } from './services/report-detector.service';
import { ReportImportQueueService } from './services/report-import-queue.service';
import { ReportImportWorkerService } from './services/report-import-worker.service';
import { ConfigSyncService } from './services/config-sync.service';
import { ReportSourceConfigService } from './services/report-source-config.service';

@Module({
  imports: [
    ClickHouseModule,
    BucketModule2,
    EtlModule,
    DspModule,
    ReleaseModule,
    SpotifyModule,
    TypeOrmModule.forFeature([Label]),
  ],
  controllers: [ReportImportController, ReportSourceConfigController],
  providers: [
    ReportImportService,
    ReportDetectorService,
    ReportImportQueueService,
    ReportImportWorkerService,
    ConfigSyncService,
    ReportSourceConfigService,
  ],
  exports: [ReportImportService],
})
export class ReportImportModule {}
