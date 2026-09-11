import { ReportSourceConfig } from './report-source.interface';

export function readReportConfigExtensions(row: Record<string, any>) {
	return {
		importSource: row.import_source || '',
		fieldMappings: JSON.parse(row.field_mappings_json || '[]'),
		parserOptions: JSON.parse(row.parser_options_json || '{}'),
	};
}

export function writeReportConfigExtensions(
	config: Partial<ReportSourceConfig>,
) {
	return {
		import_source: config.importSource || '',
		field_mappings_json: JSON.stringify(config.fieldMappings || []),
		parser_options_json: JSON.stringify(config.parserOptions || {}),
	};
}

const targets = new Set([
	'reporting_period_start',
	'reporting_period_end',
	'isrc',
	'upc',
	'track_title',
	'artist_name',
	'album_title',
	'service_name',
	'member_name',
	'label_name',
	'revenue_usd',
	'revenue_local',
	'skip',
]);
const transforms = new Set([
	'raw',
	'trim',
	'uppercase',
	'isrc',
	'decimal',
	'month_start_en_long',
	'month_end_en_long',
]);

/** Validate DB-loaded configs as well as API payloads; never execute config code. */
export function validateReportConfig(
	config: Partial<ReportSourceConfig>,
): void {
	if (
		![
			'wmg-sales',
			'spotify-report-sales',
			'configured-report-sales',
		].includes(config.parserCode || '')
	)
		throw new Error(`Unsupported parser code: ${config.parserCode}`);
	if (!config.sourceCode || !/^[a-z0-9_-]+$/.test(config.sourceCode))
		throw new Error('Invalid sourceCode');
	if (config.importSource && !/^[a-z0-9_-]+$/.test(config.importSource))
		throw new Error('Invalid importSource');
	for (const patterns of [config.filePatterns, config.folderPatterns || []]) {
		if (!Array.isArray(patterns))
			throw new Error('File/folder patterns must be arrays');
		for (const pattern of patterns) {
			if (typeof pattern !== 'string' || pattern.length > 512)
				throw new Error('Invalid report filename regex');
			new RegExp(pattern, 'i');
		}
	}
	if (!config.filePatterns?.length)
		throw new Error('At least one file pattern is required');
	if (
		!Array.isArray(config.requiredHeaders) ||
		config.requiredHeaders.some((h) => typeof h !== 'string' || !h.trim())
	)
		throw new Error('Invalid requiredHeaders');
	if (config.parserCode !== 'configured-report-sales') return;
	if (config.reportType !== 'sales')
		throw new Error('Configured report parser requires reportType=sales');
	if ((config.defaultCurrency || '').toUpperCase() !== 'USD')
		throw new Error(
			'Configured revenue reports require defaultCurrency=USD',
		);
	if (
		typeof config.delimiter !== 'string' ||
		config.delimiter.length !== 1 ||
		/[\r\n"]/.test(config.delimiter)
	)
		throw new Error('Invalid delimiter');
	if (!Array.isArray(config.fieldMappings) || !config.fieldMappings.length)
		throw new Error('fieldMappings are required');
	const mapped = new Set<string>();
	for (const m of config.fieldMappings) {
		if (!m || typeof m.reportColumn !== 'string' || !m.reportColumn.trim())
			throw new Error('Mapping reportColumn is required');
		if (
			typeof m.targetColumn !== 'string' ||
			(!targets.has(m.targetColumn) &&
				!/^metadata\.[a-z][a-z0-9_]*$/.test(m.targetColumn))
		)
			throw new Error(`Unsupported mapping target: ${m.targetColumn}`);
		if (!transforms.has(m.transform || 'trim'))
			throw new Error(`Unsupported mapping transform: ${m.transform}`);
		if (m.targetColumn !== 'skip' && mapped.has(m.targetColumn))
			throw new Error(`Duplicate mapping target: ${m.targetColumn}`);
		mapped.add(m.targetColumn);
		const expectedTransform =
			m.targetColumn === 'reporting_period_start'
				? 'month_start_en_long'
				: m.targetColumn === 'reporting_period_end'
					? 'month_end_en_long'
					: m.targetColumn.startsWith('revenue_')
						? 'decimal'
						: undefined;
		if (expectedTransform && m.transform !== expectedTransform)
			throw new Error(`${m.targetColumn} requires ${expectedTransform}`);
	}
	for (const required of [
		'reporting_period_start',
		'reporting_period_end',
		'isrc',
		'service_name',
		'member_name',
		'revenue_usd',
		'revenue_local',
	])
		if (!mapped.has(required))
			throw new Error(`Missing mapping: ${required}`);
	const opts = config.parserOptions || {};
	const allowedOptions = new Set([
		'headerRow',
		'ignoreEmptyHeader',
		'expectedProvider',
		'numericIdentifierIsUpc',
		'missingIdentifierPolicy',
		'dspAliases',
	]);
	if (Array.isArray(opts) || typeof opts !== 'object')
		throw new Error('Invalid parserOptions');
	for (const key of Object.keys(opts))
		if (!allowedOptions.has(key))
			throw new Error(`Unsupported parser option: ${key}`);
	if (
		opts.headerRow !== undefined &&
		(!Number.isInteger(opts.headerRow) ||
			opts.headerRow < 1 ||
			opts.headerRow > 100)
	)
		throw new Error('Invalid headerRow');
	for (const key of ['ignoreEmptyHeader', 'numericIdentifierIsUpc'] as const)
		if (opts[key] !== undefined && typeof opts[key] !== 'boolean')
			throw new Error(`Invalid ${key}`);
	if (
		opts.expectedProvider !== undefined &&
		(typeof opts.expectedProvider !== 'string' ||
			!opts.expectedProvider.trim())
	)
		throw new Error('Invalid expectedProvider');
	if (
		opts.missingIdentifierPolicy &&
		!['keep_na', 'reject'].includes(opts.missingIdentifierPolicy)
	)
		throw new Error('Invalid missingIdentifierPolicy');
	if (
		opts.dspAliases !== undefined &&
		(!opts.dspAliases ||
			Array.isArray(opts.dspAliases) ||
			typeof opts.dspAliases !== 'object' ||
			Object.entries(opts.dspAliases).some(
				([k, v]) =>
					!k.trim() ||
					typeof v !== 'string' ||
					!v.trim() ||
					['__proto__', 'constructor', 'prototype'].includes(k),
			))
	)
		throw new Error('Invalid DSP aliases');
}
