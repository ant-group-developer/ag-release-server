import { Module } from '@nestjs/common';
import { DspReportController } from './dsp-report.controller';
import { DspReportService } from './dsp-report.service';

@Module({
  controllers: [DspReportController],
  providers: [DspReportService],
  exports: [DspReportService],
})
export class DspReportModule {}