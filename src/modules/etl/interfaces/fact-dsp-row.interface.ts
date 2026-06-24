/**
 * Standardized row interface matching ClickHouse fact_dsp_comprehensive_report schema.
 * All parsers must transform their DSP-specific data into this shape.
 */
export interface FactDspRow {
  // Time & Partner
  reporting_period: string; // ISO date: 'YYYY-MM-DD'
  dsp_id: string;
  partner_id: string;
  account_identifier: string;
  licensor: string;
  label_name: string;

  // Geography
  territory_code: string; // ISO-2 country code, 'N/A' if unknown

  // Content Metadata
  isrc: string;
  upc: string;
  track_title: string;
  artist_name: string;
  album_title: string;
  composer_name: string;
  track_id_internal: string;

  // Metrics
  quantity_total: number;
  quantity_unique_users: number;
  quantity_invalid: number;

  // Classification
  usage_type: string;
  monetisation_type: string;
  track_classification: string;

  // DSP-specific
  metadata: Record<string, string>;

  // Source
  source_category: string; // 'trends' | 'usage' | ''

  // Audit
  batch_id: string;
  import_source?: string;
  source_file_name?: string;
}
