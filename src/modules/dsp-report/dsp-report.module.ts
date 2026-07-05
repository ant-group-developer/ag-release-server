import { Module } from '@nestjs/common';
import { DspModule } from '../dsp/dsp.module';
import { ReleaseModule } from '../release/release.module';
import { DspReportController } from './controllers/dsp-report.controller';
import { FtpExcludePatternController } from './controllers/ftp-exclude-pattern.controller';
import { DspReportService } from './services/dsp-report.service';
import { ExcludePatternService } from './services/ftp-exclude-pattern.service';

@Module({
	imports: [DspModule, ReleaseModule],
	controllers: [DspReportController, FtpExcludePatternController],
	providers: [DspReportService, ExcludePatternService],
	exports: [DspReportService, ExcludePatternService],
})
export class DspReportModule {}
