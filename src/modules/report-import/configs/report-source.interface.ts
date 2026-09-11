export interface ReportSourceConfig {
	id?: string;
	configHash?: string;
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
	importSource?: string;
	fieldMappings?: ReportFieldMapping[];
	parserOptions?: ReportParserOptions;
}

export interface ReportFieldMapping {
	reportColumn: string;
	targetColumn: string;
	transform?:
		| 'raw'
		| 'trim'
		| 'uppercase'
		| 'isrc'
		| 'decimal'
		| 'month_start_en_long'
		| 'month_end_en_long';
}

export interface ReportParserOptions {
	headerRow?: number;
	ignoreEmptyHeader?: boolean;
	expectedProvider?: string;
	numericIdentifierIsUpc?: boolean;
	missingIdentifierPolicy?: 'keep_na' | 'reject';
	dspAliases?: Record<string, string>;
}

export function resolveReportImportSource(
	config: Pick<ReportSourceConfig, 'sourceCode' | 'importSource'>,
): string {
	return config.importSource?.trim() || `${config.sourceCode}_report`;
}
