import { ReportSourceConfig } from './report-source.interface';

export const WmgConfig: ReportSourceConfig = {
  sourceCode: 'wmg',
  sourceName: 'Warner Music Group',
  reportType: 'sales',
  folderPatterns: [],
  filePatterns: ['\\d+_\\d{6}_\\d{6}_\\d+_DTL\\.csv$'],
  requiredHeaders: [
    'GPID',
    'ISRC',
    'Recdate Month ID',
    'Digital Service Provider(DSP)',
  ],
  parserCode: 'wmg-sales',
  delimiter: ',',
  defaultCurrency: '',
  defaultMember: '',
  priority: 1,
};
