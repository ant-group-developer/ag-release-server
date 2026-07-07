import { ImportJobStatus } from 'src/modules/etl/interfaces';

export interface AnalyticsReportExportResult {
	fileName: string;
	key: string;
	downloadUrl: string;
	expiresInSeconds: number;
	totalRows: number;
}

export interface AnalyticsReportExportJobResult {
	jobId: string;
	status: ImportJobStatus;
	eventsUrl: string;
}

export interface AnalyticsReportExportCancelResult {
	jobId: string;
	status: ImportJobStatus;
	cancelled: boolean;
}

export interface AnalyticsReportExportCancelAllResult {
	cancelledCount: number;
	jobIds: string[];
	skippedCount: number;
}

export interface AnalyticsReportExportCancelListResult extends AnalyticsReportExportCancelAllResult {}

export interface SummaryRow {
	startDate: string;
	endDate: string;
	totalUsage: number;
	revenueUsd: string;
	currency: string;
	trackCount: number;
	releaseCount: number;
	labelCount: number;
	dspCount: number;
	territoryCount: number;
}

export interface RawDetailRow {
	date: string;
	start_date: string;
	end_date: string;
	dsp_id: string;
	dsp_name: string;
	territory: string;
	isrc: string;
	tenant_id: string;
	release_id: string;
	label_id: string;
	fallback_upc: string;
	fallback_track_title: string;
	fallback_album_title: string;
	fallback_artist_name: string;
	fallback_label_name: string;
	total_usage: string;
	revenue_usd: string;
}

export interface DetailRow {
	date: string;
	startDate: string;
	endDate: string;
	tenant: string;
	dspName: string;
	upc: string;
	isrc: string;
	releaseName: string;
	trackName: string;
	artistName: string;
	labelName: string;
	territory: string;
	totalUsage: number;
	revenueUsd: string;
	currency: string;
}

export interface MetadataRow {
	isrc?: string;
	upc?: string;
	workspace_name: string;
	release_title: string;
	release_upc: string;
	catalog_id: string;
	release_date: string | null;
	track_title?: string;
	label_name: string;
	artist_names: string;
}

export type ExportProgressPatch = {
	progressCurrent?: number;
	progressTotal?: number;
	progressLabel?: string;
	processedRows?: number;
	totalRows?: number;
};
