import {
	TwentyTwoRAudioSaladConfig,
	TwentyTwoRWmgConfig,
} from './22r-report.config';
import { ReportSourceConfig } from './report-source.interface';
import { SpotifyReportConfig } from './spotify-report.config';
import { WmgConfig } from './wmg.config';

export * from './report-source.interface';
export * from './spotify-report.config';
export * from './wmg.config';

export const ReportSourceConfigs: ReportSourceConfig[] = [
	WmgConfig,
	SpotifyReportConfig,
	TwentyTwoRWmgConfig,
	TwentyTwoRAudioSaladConfig,
];
