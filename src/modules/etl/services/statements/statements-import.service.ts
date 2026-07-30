import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ImportJobSourceType } from '../../interfaces';
import { EtlImportHistoryRepository } from '../etl-import-history/etl-import-history.repository';
import { ImportService } from '../import/import.service';
import { SyncService } from '../sync/sync.service';
import { CanonicalFile, ResolveResult } from './statements-resolver.service';

export interface DspImportDetail {
	dspFolderName: string;
	filesImported: number;
	rowsImported: number;
	durationMs: number;
	fileNames: string[];
}

export interface StatementsSummary {
	// File counts
	totalFilesInFolder: number;
	totalFilesResolved: number; // after dedup [N], -auto, TERR
	totalFilesToImport: number;
	totalFilesSkipped: number;

	// Skip breakdown
	skippedByReason: Record<string, number>;
	skippedFiles: Array<{
		name: string;
		dsp: string;
		period: string;
		reason: string;
	}>;

	// Import results
	totalRowsImported: number;
	totalDurationMs: number;
	batchId: string;
	errors: string[];

	// Detail per DSP
	byDsp: DspImportDetail[];
}

export interface StatementsImportOptions {
	onProgress?: (label: string, current: number, total: number) => void;
	totalFilesInFolder?: number;
	jobId?: string;
}

@Injectable()
export class StatementsImportService {
	private readonly logger = new Logger(StatementsImportService.name);

	constructor(
		private readonly importService: ImportService,
		private readonly syncService: SyncService,
		private readonly etlImportHistoryRepository: EtlImportHistoryRepository,
	) {}

	async import(
		resolveResult: ResolveResult,
		opts: StatementsImportOptions = {},
	): Promise<StatementsSummary> {
		const { toImport, skipped } = resolveResult;
		const { onProgress, totalFilesInFolder = 0, jobId } = opts;

		const startTime = Date.now();
		const batchId = uuidv4();

		const summary: StatementsSummary = {
			totalFilesInFolder,
			totalFilesResolved: toImport.length + skipped.length,
			totalFilesToImport: toImport.length,
			totalFilesSkipped: skipped.length,
			skippedByReason: {},
			skippedFiles: skipped.map((f) => ({
				name: f.canonicalName,
				dsp: f.dspFolderName,
				period: f.period,
				reason: f.skipReason ?? 'unknown',
			})),
			totalRowsImported: 0,
			totalDurationMs: 0,
			batchId,
			errors: [],
			byDsp: [],
		};

		// Tally skip reasons
		for (const f of skipped) {
			const r = f.skipReason ?? 'unknown';
			summary.skippedByReason[r] = (summary.skippedByReason[r] ?? 0) + 1;
		}

		if (!toImport.length) {
			summary.totalDurationMs = Date.now() - startTime;
			return summary;
		}

		// Step 1: delete old data for -auto revisions
		const autoRevisions = toImport.filter((f) => f.isAutoRevision);
		const deletedKeys = new Set<string>();
		let autoStep = 0;
		for (const f of autoRevisions) {
			const key = `${f.dspFolderName}|${f.period}`;
			if (deletedKeys.has(key)) continue;
			deletedKeys.add(key);
			autoStep++;
			onProgress?.(
				`Deleting existing data: ${f.dspFolderName}/${f.period}`,
				autoStep,
				autoRevisions.length,
			);
			this.logger.log(
				`Deleting existing data for auto-revision: ${f.dspFolderName} / ${f.period}`,
			);
			try {
				await this.syncService.deleteDataForManualImport(
					f.period,
					f.dspFolderName,
				);
			} catch (err) {
				const msg = `Failed to delete data for ${f.dspFolderName}/${f.period}: ${(err as Error).message}`;
				this.logger.error(msg);
				summary.errors.push(msg);
			}
		}

		// Step 2: group files by DSP folder
		const byDsp = new Map<string, CanonicalFile[]>();
		for (const f of toImport) {
			if (!byDsp.has(f.dspFolderName)) byDsp.set(f.dspFolderName, []);
			byDsp.get(f.dspFolderName)!.push(f);
		}

		const dspList = [...byDsp.entries()];
		const tempBase = path.join(os.tmpdir(), `statements-import-${batchId}`);
		fs.mkdirSync(tempBase, { recursive: true });

		try {
			let dspStep = 0;
			for (const [dspFolderName, dspFiles] of dspList) {
				dspStep++;
				onProgress?.(
					`Importing ${dspFolderName} (${dspFiles.length} files)`,
					dspStep,
					dspList.length,
				);

				const dspTempDir = path.join(tempBase, dspFolderName);
				fs.mkdirSync(dspTempDir, { recursive: true });

				for (const f of dspFiles) {
					const dest = path.join(
						dspTempDir,
						path.basename(f.localPath),
					);
					try {
						if (!fs.existsSync(dest))
							fs.symlinkSync(f.localPath, dest);
					} catch {
						fs.copyFileSync(f.localPath, dest);
					}
				}

				this.logger.log(
					`Importing ${dspFiles.length} files for ${dspFolderName}`,
				);
				try {
					const dspResult = await this.importService.importDspFolder(
						dspTempDir,
						dspFolderName,
						batchId,
						'sales',
						'bombshelter',
					);

					if (dspResult) {
						summary.totalRowsImported += dspResult.rows;
						summary.byDsp.push({
							dspFolderName,
							filesImported: dspResult.files,
							rowsImported: dspResult.rows,
							durationMs: dspResult.durationMs,
							fileNames: dspResult.fileNames,
						});

						// Write per-file records to etl_import_history
						if (jobId && dspResult.fileStats?.length) {
							for (const stat of dspResult.fileStats) {
								const fileCanonical = dspFiles.find(
									(f) => path.basename(f.localPath) === stat.fileName,
								);
								await this.etlImportHistoryRepository.upsert({
									job_id: jobId,
									batch_id: batchId,
									period: fileCanonical?.period ?? '',
									source_type: ImportJobSourceType.STATEMENTS_UPLOAD,
									category: 'sales',
									dsp_folder: dspFolderName,
									file_name: stat.fileName,
									file_directory: `sales/${fileCanonical?.period ?? ''}/${dspFolderName}`,
									file_path: `sales/${fileCanonical?.period ?? ''}/${dspFolderName}/${stat.fileName}`,
									status: 'done',
									file_size_bytes: stat.fileSizeBytes,
									total_lines: stat.totalLines,
									processed_rows: stat.processedRows,
									skipped_rows: stat.skippedRows,
									error_rows: stat.errorRows,
									duration_ms: dspResult.durationMs,
								}).catch((err) =>
									this.logger.warn(`Failed to write etl_import_history for ${stat.fileName}: ${(err as Error).message}`),
								);
							}
						}
					}
				} catch (err) {
					const msg = `Import failed for ${dspFolderName}: ${(err as Error).message}`;
					this.logger.error(msg);
					summary.errors.push(msg);
				}
			}
		} finally {
			fs.rmSync(tempBase, { recursive: true, force: true });
		}

		summary.totalDurationMs = Date.now() - startTime;
		return summary;
	}
}
