import { Module } from '@nestjs/common';
import { DspModule } from '../dsp/dsp.module';
import { ReleaseModule } from '../release/release.module';
import { DspReportController } from './controllers/dsp-report.controller';
import { FtpExcludePatternController } from './controllers/ftp-exclude-pattern.controller';
import { FtpReportFileRuleController } from './controllers/ftp-report-file-rule.controller';
import { DspReportService } from './services/dsp-report.service';
import { ExcludePatternService } from './services/ftp-exclude-pattern.service';
import { FtpParserConfigService } from './services/ftp-parser-config.service';
import { FtpReportFileRuleService } from './services/ftp-report-file-rule.service';

@Module({
	imports: [DspModule, ReleaseModule],
	controllers: [DspReportController, FtpExcludePatternController, FtpReportFileRuleController],
	providers: [
		DspReportService,
		ExcludePatternService,
		FtpParserConfigService,
		FtpReportFileRuleService,
	],
	exports: [DspReportService, ExcludePatternService, FtpParserConfigService, FtpReportFileRuleService],
})
export class DspReportModule {}
