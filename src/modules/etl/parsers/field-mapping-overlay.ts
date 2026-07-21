/**
 * Runtime mapping data loaded from the parser-config tables. `parserColumn` is
 * internal compatibility metadata: it lets a renamed report header feed the
 * existing hard-coded parser before an optional target-field override is applied.
 */
export interface ConfiguredFieldMapping {
	reportColumn: string;
	parserColumn?: string;
	targetColumn: string;
	transform?: string;
}

export function readSourceValue(
	record: Record<string, string>,
	column: string,
): string {
	if (record[column] !== undefined) return record[column];
	const normalizedColumn = column.trim().toLocaleLowerCase();
	const key = Object.keys(record).find(
		(header) =>
			header
				.replace(/^\uFEFF/, '')
				.trim()
				.toLocaleLowerCase() === normalizedColumn,
	);
	return key ? record[key] : '';
}

/** Make configured report headers available under the names read by legacy code. */
export function applyInputAliases(
	record: Record<string, string>,
	mappings: ConfiguredFieldMapping[],
): void {
	for (const mapping of mappings) {
		const parserColumn = mapping.parserColumn?.trim();
		if (!parserColumn || parserColumn === mapping.reportColumn) continue;
		record[parserColumn] = readSourceValue(record, mapping.reportColumn);
	}
}

export function transformMappedValue(
	value: string,
	transform?: string,
): string {
	switch (transform || 'trim') {
		case 'raw':
			return value;
		case 'uppercase':
			return value.trim().toUpperCase();
		case 'lowercase':
			return value.trim().toLowerCase();
		case 'isrc':
			return value.trim().toUpperCase().replace(/[-\s]/g, '');
		default:
			return value.trim().replace(/\s+/g, ' ');
	}
}
