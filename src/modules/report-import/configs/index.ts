import { ReportSourceConfig } from './report-source.interface';
import { WmgConfig } from './wmg.config';
import { SpotifyReportConfig } from './spotify-report.config';

export * from './report-source.interface';
export * from './wmg.config';
export * from './spotify-report.config';

export const ReportSourceConfigs: ReportSourceConfig[] = [WmgConfig, SpotifyReportConfig];

