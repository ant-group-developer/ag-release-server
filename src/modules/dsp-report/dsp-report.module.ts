import { Module } from '@nestjs/common';
import { DspReportController } from './controllers/dsp-report.controller';
import { DspReportService } from './services/dsp-report.service';
import { FtpExcludePatternController } from './controllers/ftp-exclude-pattern.controller';
import { ExcludePatternService } from './services/ftp-exclude-pattern.service';

@Module({
  controllers: [DspReportController, FtpExcludePatternController],
  providers: [DspReportService, ExcludePatternService],
  exports: [DspReportService, ExcludePatternService],
})
export class DspReportModule { }