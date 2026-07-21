import { FactDspRow, FactSalesRow } from '../interfaces';
import { BaseParser } from './base.parser';
import {
	ConfiguredFieldMapping,
	readSourceValue,
	transformMappedValue,
} from './field-mapping-overlay';
import { BaseSalesParser } from './sales/base-sales.parser';

/** A report header mapped to a writable fact-table column at runtime. */
export type { ConfiguredFieldMapping } from './field-mapping-overlay';

const DSP_NUMBER_COLUMNS = new Set([
	'quantity_total',
	'quantity_unique_users',
	'quantity_invalid',
]);
const SALES_NUMBER_COLUMNS = new Set([
	'quantity',
	'quantity_creations',
	'quantity_views',
]);
const SALES_DECIMAL_COLUMNS = new Set(['revenue_usd', 'revenue_local']);

/**
 * Generic parser used when a DSP/category has field mappings in the database.
 * It intentionally supports only safe, declared transforms; arbitrary code from
 * the configuration must never be executed by the importer.
 */
export class ConfiguredDspFieldMappingParser extends BaseParser {
	constructor(
		private readonly mappings: ConfiguredFieldMapping[],
		private readonly category: string,
	) {
		super('');
	}

	protected parseRow(
		record: Record<string, string>,
		batchId: string,
		_filePath: string,
	): FactDspRow {
		const row = this.createBaseRow(batchId);
		row.source_category = this.category;
		for (const mapping of this.mappings) {
			const value = readSourceValue(record, mapping.reportColumn);
			this.assign(row, mapping, value);
		}
		return row;
	}

	private assign(
		row: FactDspRow,
		mapping: ConfiguredFieldMapping,
		value: string,
	): void {
		if (mapping.targetColumn.startsWith('metadata.')) {
			row.metadata[mapping.targetColumn.slice('metadata.'.length)] =
				this.transform(value, mapping.transform);
			return;
		}
		const target = mapping.targetColumn as keyof FactDspRow;
		if (DSP_NUMBER_COLUMNS.has(mapping.targetColumn)) {
			(row as unknown as Record<string, unknown>)[target] = this.safeInt(
				this.transform(value, mapping.transform),
			);
			return;
		}
		if (mapping.targetColumn === 'reporting_period') {
			(row as unknown as Record<string, unknown>)[target] =
				this.normalizeDate(this.transform(value, mapping.transform));
			return;
		}
		if (mapping.targetColumn === 'territory_code') {
			(row as unknown as Record<string, unknown>)[target] =
				this.normalizeCountryCode(
					this.transform(value, mapping.transform),
				);
			return;
		}
		(row as unknown as Record<string, unknown>)[target] = this.transform(
			value,
			mapping.transform,
		);
	}

	private transform(value: string, transform?: string): string {
		return transformMappedValue(value, transform);
	}
}

export class ConfiguredSalesFieldMappingParser extends BaseSalesParser {
	constructor(private readonly mappings: ConfiguredFieldMapping[]) {
		super('');
	}

	protected parseRow(
		record: Record<string, string>,
		batchId: string,
		_filePath: string,
	): FactSalesRow {
		const row = this.createBaseRow(batchId);
		for (const mapping of this.mappings) {
			const value = readSourceValue(record, mapping.reportColumn);
			this.assign(row, mapping, value);
		}
		return row;
	}

	private assign(
		row: FactSalesRow,
		mapping: ConfiguredFieldMapping,
		value: string,
	): void {
		if (mapping.targetColumn.startsWith('metadata.')) {
			row.metadata[mapping.targetColumn.slice('metadata.'.length)] =
				this.transform(value, mapping.transform);
			return;
		}
		const target = mapping.targetColumn as keyof FactSalesRow;
		if (SALES_NUMBER_COLUMNS.has(mapping.targetColumn)) {
			(row as unknown as Record<string, unknown>)[target] = this.safeInt(
				this.transform(value, mapping.transform),
			);
			return;
		}
		if (SALES_DECIMAL_COLUMNS.has(mapping.targetColumn)) {
			(row as unknown as Record<string, unknown>)[target] =
				this.safeDecimal(this.transform(value, mapping.transform));
			return;
		}
		if (
			mapping.targetColumn === 'reporting_period_start' ||
			mapping.targetColumn === 'reporting_period_end'
		) {
			(row as unknown as Record<string, unknown>)[target] =
				this.normalizeDate(
					this.transform(value, mapping.transform),
					mapping.targetColumn === 'reporting_period_start',
				);
			return;
		}
		if (mapping.targetColumn === 'territory_code') {
			(row as unknown as Record<string, unknown>)[target] =
				this.normalizeCountryCode(
					this.transform(value, mapping.transform),
				);
			return;
		}
		(row as unknown as Record<string, unknown>)[target] = this.transform(
			value,
			mapping.transform,
		);
	}

	private transform(value: string, transform?: string): string {
		return transformMappedValue(value, transform);
	}
}
