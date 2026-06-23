import { ReportSourceConfig } from './report-source.interface';

export const SpotifyReportConfig: ReportSourceConfig = {
  sourceCode: 'spotify',
  sourceName: 'Spotify',
  reportType: 'sales',
  folderPatterns: [],
  filePatterns: [
    'spotify-track-for-.*\\.txt$',
    'spotify-track-for-.*\\.txt\\.gz$',
  ],
  requiredHeaders: [
    'Country',
    'ISRC',
    'UPC',
    'Quantity',
    'Payable (Reporting)',
  ],
  parserCode: 'spotify-report-sales',
  delimiter: '\t',
  defaultCurrency: 'USD',
  defaultMember: 'ANT MUSIC LLC',
  priority: 2,
};
