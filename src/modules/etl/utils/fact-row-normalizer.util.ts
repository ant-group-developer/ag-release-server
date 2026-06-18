import { normalizeReportUpcOrFallback } from 'src/utils/upc.util';

const TEXT_NA = 'N/A';

const NON_TEXT_FIELDS = new Set([
  'reporting_period',
  'reporting_period_start',
  'reporting_period_end',
  'dsp_id',
  'batch_id',
  'import_source',
  'source_file_name',
  'quantity_total',
  'quantity_unique_users',
  'quantity_invalid',
  'quantity',
  'quantity_creations',
  'quantity_views',
  'revenue_usd',
  'revenue_local',
]);

export function normalizeFactTextFields<T extends Record<string, any>>(row: T): T {
  for (const [key, value] of Object.entries(row)) {
    if (key === 'metadata' && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [metaKey, metaValue] of Object.entries(value)) {
        if (typeof metaValue === 'string') {
          value[metaKey] = normalizeTextValue(metaValue);
        }
      }
      continue;
    }

    if (NON_TEXT_FIELDS.has(key)) continue;

    if (typeof value === 'string') {
      row[key as keyof T] = normalizeTextValue(value) as T[keyof T];
    }
  }

  const record = row as Record<string, any>;
  if (typeof record.upc === 'string') {
    record.upc = normalizeTextValue(
      normalizeReportUpcOrFallback(record.upc, record.isrc),
    );
  }

  return row;
}

export function normalizeFactRows<T extends Record<string, any>>(rows: T[]): T[] {
  for (const row of rows) {
    normalizeFactTextFields(row);
  }
  return rows;
}

export function normalizeTextValue(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : TEXT_NA;
}

export function hasMeaningfulText(value: string | null | undefined): boolean {
  const trimmed = value?.trim();
  return Boolean(trimmed && trimmed.toUpperCase() !== TEXT_NA);
}
