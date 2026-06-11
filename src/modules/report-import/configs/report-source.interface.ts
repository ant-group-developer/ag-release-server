export interface ReportSourceConfig {
  sourceCode: string;
  sourceName: string;
  reportType: 'sales' | 'trends' | 'usage';
  folderPatterns: string[];
  filePatterns: string[];
  requiredHeaders: string[];
  parserCode: string;
  delimiter: string;
  defaultCurrency: string;
  defaultMember: string;
  priority: number;
}
