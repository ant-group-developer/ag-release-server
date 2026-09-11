import {
	ReportFieldMapping,
	ReportSourceConfig,
} from './report-source.interface';

const mappings: ReportFieldMapping[] = [
	{
		reportColumn: 'Transaction Date',
		targetColumn: 'reporting_period_start',
		transform: 'month_start_en_long',
	},
	{
		reportColumn: 'Transaction Date',
		targetColumn: 'reporting_period_end',
		transform: 'month_end_en_long',
	},
	{ reportColumn: 'ISRC', targetColumn: 'isrc', transform: 'isrc' },
	{
		reportColumn: 'Track Title',
		targetColumn: 'track_title',
		transform: 'trim',
	},
	{
		reportColumn: 'Artist Name',
		targetColumn: 'artist_name',
		transform: 'trim',
	},
	{ reportColumn: 'DSP', targetColumn: 'service_name', transform: 'trim' },
	{
		reportColumn: 'Provider',
		targetColumn: 'member_name',
		transform: 'trim',
	},
	{
		reportColumn: 'Revenue in USD',
		targetColumn: 'revenue_usd',
		transform: 'decimal',
	},
	{
		reportColumn: 'Revenue in USD',
		targetColumn: 'revenue_local',
		transform: 'decimal',
	},
];

export const TwentyTwoRWmgConfig: ReportSourceConfig = {
	sourceCode: '22r_wmg',
	sourceName: '22R x WMG',
	reportType: 'sales',
	folderPatterns: [],
	filePatterns: ['^22RxWmg_\\d{6}-\\d{6}(?: - Sheet\\d+)?\\.csv$'],
	requiredHeaders: [
		'Transaction Date',
		'ISRC',
		'Artist Name',
		'Track Title',
		'Revenue in USD',
		'Provider',
		'DSP',
		'DSP Clean',
	],
	parserCode: 'configured-report-sales',
	delimiter: ',',
	defaultCurrency: 'USD',
	defaultMember: '22R x WMG',
	priority: 10,
	importSource: 'wmg_report',
	fieldMappings: [
		...mappings,
		{
			reportColumn: 'DSP Clean',
			targetColumn: 'metadata.dsp_clean',
			transform: 'raw',
		},
	],
	parserOptions: {
		headerRow: 1,
		ignoreEmptyHeader: true,
		expectedProvider: '22R x WMG',
		numericIdentifierIsUpc: true,
		missingIdentifierPolicy: 'keep_na',
		dspAliases: {
			Youtube: 'YouTube',
			Soundcloud: 'SoundCloud',
			Tiktok: 'TikTok',
		},
	},
};

export const TwentyTwoRAudioSaladConfig: ReportSourceConfig = {
	...TwentyTwoRWmgConfig,
	sourceCode: '22r_audiosalad',
	sourceName: '22R x Audio Salad',
	defaultMember: '22R x Audio Salad',
	filePatterns: ['^22RxAudioSalad_\\d{6}-\\d{6}(?: - Sheet\\d+)?\\.csv$'],
	requiredHeaders: TwentyTwoRWmgConfig.requiredHeaders.filter(
		(h) => h !== 'DSP Clean',
	),
	importSource: 'audio_salad_report',
	fieldMappings: [...mappings],
	parserOptions: {
		...TwentyTwoRWmgConfig.parserOptions,
		expectedProvider: '22R x Audio Salad',
		numericIdentifierIsUpc: false,
	},
};
