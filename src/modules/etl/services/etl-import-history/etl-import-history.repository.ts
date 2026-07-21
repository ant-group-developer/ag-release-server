import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ClickHouseService } from '../../../clickhouse/clickhouse.service';

export interface EtlImportHistoryRecord {
	job_id: string;
	batch_id?: string;
	period?: string;
	source_type: string;
	category?: string;
	dsp_folder?: string;
	file_name: string;
	file_directory?: string;
	file_path: string;
	status: 'processing' | 'done' | 'error';
	total_lines?: number;
	processed_rows?: number;
	skipped_rows?: number;
	error_rows?: number;
	duration_ms?: number;
	error_message?: string;
}

export interface EtlImportHistoryRow {
	id: string;
	job_id: string;
	batch_id: string;
	period: string;
	source_type: string;
	category: string;
	dsp_folder: string;
	file_name: string;
	file_directory: string;
	file_path: string;
	status: string;
	total_lines: string;
	processed_rows: string;
	skipped_rows: string;
	error_rows: string;
	duration_ms: string;
	error_message: string;
	started_at: string;
	completed_at: string;
}

@Injectable()
export class EtlImportHistoryRepository {
	constructor(private readonly clickHouseService: ClickHouseService) {}

	async upsert(record: EtlImportHistoryRecord): Promise<void> {
		const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
		await this.clickHouseService.insert('etl_import_history', [
			{
				id: uuidv4(),
				job_id: record.job_id,
				batch_id: record.batch_id ?? '',
				period: record.period ?? '',
				source_type: record.source_type,
				category: record.category ?? '',
				dsp_folder: record.dsp_folder ?? '',
				file_name: record.file_name,
				file_directory: record.file_directory ?? '',
				file_path: record.file_path,
				status: record.status,
				total_lines: record.total_lines ?? 0,
				processed_rows: record.processed_rows ?? 0,
				skipped_rows: record.skipped_rows ?? 0,
				error_rows: record.error_rows ?? 0,
				duration_ms: record.duration_ms ?? 0,
				error_message: record.error_message ?? '',
				started_at: now,
				completed_at: now,
			},
		]);
	}

	async findByJobId(jobId: string): Promise<EtlImportHistoryRow[]> {
		const sql = `
      SELECT *
      FROM etl_import_history FINAL
      WHERE job_id = {jobId:String}
      ORDER BY started_at ASC
    `;
		return this.clickHouseService.query<EtlImportHistoryRow>(sql, { jobId });
	}
}
