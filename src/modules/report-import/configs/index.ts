import { ReportSourceConfig } from './report-source.interface';
import { WmgConfig } from './wmg.config';

export * from './report-source.interface';
export * from './wmg.config';

export const ReportSourceConfigs: ReportSourceConfig[] = [WmgConfig];
