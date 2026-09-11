/**
 * Standardized row interface matching ClickHouse fact_sales_report schema.
 * All sales parsers must transform their DSP-specific data into this shape.
 */
export interface FactSalesRow {
	// Time
	reporting_period_start: string; // 'YYYY-MM-DD'
	reporting_period_end: string; // 'YYYY-MM-DD'

	// Partner
	dsp_id: string;
	service_name: string;
	dpid: string;
	member_name: string;
	label_name: string;

	// Geography
	territory_code: string;

	// Content
	isrc: string;
	upc: string;
	grid: string;
	release_id: string;
	track_title: string;
	artist_name: string;
	album_title: string;
	composer_name: string;
	genre: string;

	// Metrics
	quantity: number;
	quantity_creations: number;
	quantity_views: number;

	// Revenue (string to preserve exact decimal precision for Decimal128)
	revenue_usd: string;
	revenue_local: string;
	revenue_currency: string;

	// Classification
	usage_type: string;
	monetisation_type: string;
	service_tier: string;
	plan_name: string;
	commercial_model: string;

	// DSP-specific
	metadata: Record<string, string>;

	// Audit
	source_category: string;
	batch_id: string;
	import_source?: string;
	source_file_name?: string;
	ingest_tenant_id?: string;
	ingest_label_id?: string;
}
