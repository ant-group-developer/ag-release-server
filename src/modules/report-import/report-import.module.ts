import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule2 } from '../bucket2/bucket2.module';
import { ClickHouseModule } from '../clickhouse/clickhouse.module';
import { DspModule } from '../dsp/dsp.module';
import { EtlModule } from '../etl/etl.module';
import { Label } from '../label/entities/label.entity';
import { SpotifyModule } from '../partners-api/spotify/spotify.module';
import { ReleaseModule } from '../release/release.module';
import { ReportImportController } from './controllers/report-import.controller';
import { ReportSourceConfigController } from './controllers/report-source-config.controller';
import { ConfigSyncService } from './services/config-sync.service';
import { ReportDetectorService } from './services/report-detector.service';
import { ReportImportQueueService } from './services/report-import-queue.service';
import { ReportImportWorkerService } from './services/report-import-worker.service';
import { ReportImportService } from './services/report-import.service';
import { ReportSourceConfigService } from './services/report-source-config.service';
import { ImportedReleaseDeleteService } from './services/imported-release-delete.service';
import { SpotifyR2SyncService } from './services/spotify-r2-sync.service';

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
    ImportedReleaseDeleteService,
    SpotifyR2SyncService,
  ],
  exports: [ReportImportService],
})
export class ReportImportModule {}
