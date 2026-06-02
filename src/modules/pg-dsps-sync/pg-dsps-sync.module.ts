import { Module } from '@nestjs/common';
import { PgDspsSyncController } from './pg-dsps-sync.controller';
import { PgDspsSyncService } from './pg-dsps-sync.service';

@Module({
  controllers: [PgDspsSyncController],
  providers: [PgDspsSyncService],
  exports: [PgDspsSyncService],
})
export class PgDspsSyncModule {}