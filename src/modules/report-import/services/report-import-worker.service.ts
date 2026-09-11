import {
	Injectable,
	Logger,
	OnApplicationBootstrap,
	OnApplicationShutdown,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { Repository } from 'typeorm';
import { BucketR2Service } from '../../bucket2/services/bucket-r2.service';
import { ClickHouseMigrationService } from '../../clickhouse/clickhouse-migration.service';
import { CLICKHOUSE_TABLES } from '../../clickhouse/clickhouse.constants';
import { ClickHouseService } from '../../clickhouse/clickhouse.service';
import { DspReportService } from '../../dsp-report/services/dsp-report.service';
import { DspMappingService } from '../../dsp/services/dsp-mapping.service';
import {
	FactSalesRow,
	ImportJob,
	ImportJobSourceType,
	ImportJobStatus,
} from '../../etl/interfaces';
import {
	ConfiguredReportSalesParser,
	ReportValidationSummary,
	reportDecimalUnits,
} from '../../etl/parsers/sales/configured-report-sales.parser';
import { SpotifyReportSalesParser } from '../../etl/parsers/sales/spotify-report-sales.parser';
import { WmgSalesParser } from '../../etl/parsers/sales/wmg-sales.parser';
import { AnalyticsProjectionRefreshService } from '../../etl/services/cube-rebuild/analytics-projection-refresh.service';
import { EtlImportHistoryRepository } from '../../etl/services/etl-import-history/etl-import-history.repository';
import { ImportJobsService } from '../../etl/services/import-jobs/import-jobs.service';
import {
	hasMeaningfulText,
	normalizeFactRows,
} from '../../etl/utils/fact-row-normalizer.util';
import { Label } from '../../label/entities/label.entity';
import {
	ExtractedRow,
	ReportEntityExtractorService,
} from '../../release/services/report-entity-extractor.service';
import {
	ReportSourceConfig,
	resolveReportImportSource,
} from '../configs/report-source.interface';
import { ReportImportQueueService } from './report-import-queue.service';

type ReportImportStage =
	| 'FACT_IMPORT'
	| 'METADATA_IMPORT'
	| 'EXCHANGE_RATE'
	| 'CUBE_REBUILD'
	| 'COMPLETED';

type ReportImportFileStatus = 'PENDING' | 'IMPORTING' | 'FACT_IMPORTED';

interface ReportImportFileCheckpoint {
	status: ReportImportFileStatus;
	tenantId: string;
	sourceFileName: string;
	importSource: string;
	parserCode?: string;
	factTable: string;
	rows: number;
	affectedPeriods: string[];
	updatedAt: string;
	validation?: ReportValidationSummary;
	skippedRows?: number;
	dspIds?: string[];
	metadataDspId?: string;
}

interface ReportImportState {
	stage: ReportImportStage;
	files: Record<string, ReportImportFileCheckpoint>;
}

@Injectable()
export class ReportImportWorkerService
	implements OnApplicationBootstrap, OnApplicationShutdown
{
	private readonly logger = new Logger(ReportImportWorkerService.name);
	private isRunning = true;
	private workerPromise: Promise<void> | null = null;

	constructor(
		private readonly queueService: ReportImportQueueService,
		private readonly r2Service: BucketR2Service,
		private readonly importJobsService: ImportJobsService,
		private readonly analyticsProjectionRefreshService: AnalyticsProjectionRefreshService,
		private readonly dspMappingService: DspMappingService,
		private readonly clickHouseService: ClickHouseService,
		private readonly reportEntityExtractorService: ReportEntityExtractorService,
		@InjectRepository(Label)
		private readonly labelRepo: Repository<Label>,
		private readonly clickHouseMigrationService: ClickHouseMigrationService,
		private readonly etlImportHistoryRepository: EtlImportHistoryRepository,
		private readonly dspReportService: DspReportService,
	) {}

	onApplicationBootstrap() {
		if (process.env.APP_ROLE !== 'worker') {
			this.logger.debug(
				'Skipping report import worker loop (not worker role)',
			);
			return;
		}
		this.initializeWorkerInBackground().catch((err) => {
			this.logger.error(
				`Failed to initialize Report Import Worker: ${err.message}`,
				err.stack,
			);
		});
	}

	private async initializeWorkerInBackground() {
		await this.clickHouseMigrationService.waitForMigrations();

		// Redeliver any jobs stuck in processing from a previous crash
		await this.queueService.redeliverStuckJobs().catch((err) => {
			this.logger.error(`Failed to redeliver stuck jobs: ${err.message}`);
		});

		await this.recoverReportUploadJobs().catch((err) => {
			this.logger.error(
				`Failed to recover report upload jobs: ${err.message}`,
			);
		});

		// Start worker loop
		this.workerPromise = this.runWorkerLoop();
	}

	async onApplicationShutdown() {
		this.logger.log('Stopping Report Import Worker...');
		this.isRunning = false;
		if (this.workerPromise) {
			await this.workerPromise;
		}
	}

	private async runWorkerLoop() {
		while (this.isRunning) {
			try {
				const jobId = await this.queueService.popJob();
				if (jobId) {
					this.logger.log(`Worker picked up Job ID: ${jobId}`);
					await this.processJob(jobId);
				} else {
					// Sleep for 5 seconds if no jobs
					await new Promise((resolve) => setTimeout(resolve, 5000));
				}
			} catch (err) {
				this.logger.error(
					`Error in worker loop: ${err.message}`,
					err.stack,
				);
				await new Promise((resolve) => setTimeout(resolve, 5000));
			}
		}
	}

	private async recoverReportUploadJobs(): Promise<void> {
		const jobs =
			await this.importJobsService.findRecoverableReportUploadJobs();
		if (!jobs.length) return;

		this.logger.warn(
			`Recovering ${jobs.length} report import job(s) after startup`,
		);
		for (const job of jobs) {
			if (await this.queueService.hasJob(job.id)) continue;
			await this.queueService.pushJob(job.id);
		}
	}

	private getFileKey(file: { r2Key?: string; path?: string }): string {
		return file.r2Key || file.path || '';
	}

	private getReportImportState(
		job: ImportJob,
		files: any[],
	): ReportImportState {
		const raw = job.params?.reportImportState as
			| Partial<ReportImportState>
			| undefined;
		const state: ReportImportState = {
			stage: this.isReportImportStage(raw?.stage)
				? raw.stage
				: 'FACT_IMPORT',
			files:
				raw?.files && typeof raw.files === 'object'
					? { ...raw.files }
					: {},
		};

		for (const file of files) {
			const key = this.getFileKey(file);
			if (!key) continue;
			if (state.files[key]) {
				state.files[key].tenantId = job.tenantId;
				continue;
			}

			const sourceFileName = path.posix.basename(
				file.path.replace(/\\/g, '/'),
			);
			state.files[key] = {
				status: 'PENDING',
				tenantId: job.tenantId,
				sourceFileName,
				importSource: resolveReportImportSource(file),
				parserCode: file.parserCode,
				factTable:
					file.reportType === 'sales'
						? CLICKHOUSE_TABLES.FACT_SALES_REPORT
						: CLICKHOUSE_TABLES.FACT_DSP_COMPREHENSIVE_REPORT,
				rows: 0,
				affectedPeriods: [],
				updatedAt: new Date().toISOString(),
			};
		}

		return state;
	}

	private isReportImportStage(value: unknown): value is ReportImportStage {
		return (
			value === 'FACT_IMPORT' ||
			value === 'METADATA_IMPORT' ||
			value === 'EXCHANGE_RATE' ||
			value === 'CUBE_REBUILD' ||
			value === 'COMPLETED'
		);
	}

	private async saveReportImportState(
		jobId: string,
		state: ReportImportState,
	): Promise<void> {
		await this.importJobsService.patchParams(jobId, {
			reportImportState: state,
		});
	}

	private getImportedFileCheckpoints(
		state: ReportImportState,
	): ReportImportFileCheckpoint[] {
		return Object.values(state.files).filter(
			(file) => file.status === 'FACT_IMPORTED',
		);
	}

	private escapeSqlString(value: string): string {
		return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
	}

	private async resolveFallbackLabelName(
		labelId?: string,
	): Promise<string | undefined> {
		if (!labelId?.trim()) return undefined;

		const label = await this.labelRepo.findOne({
			where: { id: labelId.trim() },
		});

		return hasMeaningfulText(label?.name) ? label!.name.trim() : undefined;
	}

	private async deleteFactRowsForFile(
		factTable: string,
		filename: string,
		importSource: string,
		tenantId: string,
	): Promise<string[]> {
		const tenantPredicate =
			factTable === CLICKHOUSE_TABLES.FACT_SALES_REPORT
				? ` AND (ingest_tenant_id = {tenantId:String}
				     OR (ingest_tenant_id = '' AND batch_id IN (
				       SELECT id FROM music_analytics.${CLICKHOUSE_TABLES.IMPORT_JOBS} FINAL
				       WHERE tenant_id = {tenantId:String}
				     )))`
				: '';
		const params = { filename, source: importSource, tenantId };
		const countRows = await this.clickHouseService.query<{ cnt: string }>(
			`SELECT count() AS cnt FROM music_analytics.${factTable}
			 WHERE source_file_name = {filename:String} AND import_source = {source:String}${tenantPredicate}`,
			params,
		);

		if (Number(countRows[0]?.cnt ?? 0) === 0) return [];
		const dateColumn =
			factTable === CLICKHOUSE_TABLES.FACT_SALES_REPORT
				? 'reporting_period_start'
				: 'reporting_period';
		const periodRows = await this.clickHouseService.query<{
			period: string;
		}>(
			`SELECT DISTINCT formatDateTime(${dateColumn}, '%Y-%m') AS period
			 FROM music_analytics.${factTable}
			 WHERE source_file_name = {filename:String} AND import_source = {source:String}${tenantPredicate}`,
			params,
		);

		this.logger.warn(
			`Deleting existing fact rows for ${filename} (${importSource}) before import/resume`,
		);
		await this.clickHouseService.execute(
			`ALTER TABLE music_analytics.${factTable} DELETE
       WHERE source_file_name = '${this.escapeSqlString(filename)}'
			 AND import_source = '${this.escapeSqlString(importSource)}'${
					factTable === CLICKHOUSE_TABLES.FACT_SALES_REPORT
						? ` AND (ingest_tenant_id = '${this.escapeSqlString(tenantId)}'
					     OR (ingest_tenant_id = '' AND batch_id IN (
					       SELECT id FROM music_analytics.${CLICKHOUSE_TABLES.IMPORT_JOBS} FINAL
					       WHERE tenant_id = '${this.escapeSqlString(tenantId)}'
					     )))`
						: ''
				}`,
		);
		await this.clickHouseService.waitForTableMutations(factTable);
		return periodRows.map((row) => row.period).filter(Boolean);
	}

	private buildSourceFilter(
		checkpoints: ReportImportFileCheckpoint[],
		factTable: string,
	): {
		where: string;
		params: Record<string, string>;
	} {
		const params: Record<string, string> = {};
		const clauses = checkpoints.map((checkpoint, index) => {
			params[`filename${index}`] = checkpoint.sourceFileName;
			params[`source${index}`] = checkpoint.importSource;
			if (checkpoint.metadataDspId)
				params[`dsp${index}`] = checkpoint.metadataDspId;
			if (factTable === CLICKHOUSE_TABLES.FACT_SALES_REPORT)
				params[`tenant${index}`] = checkpoint.tenantId;
			return `(source_file_name = {filename${index}:String} AND import_source = {source${index}:String}${factTable === CLICKHOUSE_TABLES.FACT_SALES_REPORT ? ` AND ingest_tenant_id = {tenant${index}:String}` : ''}${checkpoint.metadataDspId ? ` AND dsp_id = {dsp${index}:String}` : ''})`;
		});

		return {
			where: clauses.length ? clauses.join(' OR ') : '0',
			params,
		};
	}

	private async loadMetadataRowsFromClickHouse(
		checkpoints: ReportImportFileCheckpoint[],
	): Promise<ExtractedRow[]> {
		const rows: ExtractedRow[] = [];
		const byTable = new Map<string, ReportImportFileCheckpoint[]>();

		for (const checkpoint of checkpoints) {
			const tableCheckpoints = byTable.get(checkpoint.factTable) ?? [];
			tableCheckpoints.push(checkpoint);
			byTable.set(checkpoint.factTable, tableCheckpoints);
		}

		for (const [factTable, tableCheckpoints] of byTable) {
			const { where, params } = this.buildSourceFilter(
				tableCheckpoints,
				factTable,
			);
			const tableRows = await this.clickHouseService.query<ExtractedRow>(
				`
          SELECT
            isrc,
            upc,
            argMax(track_title, score) AS track_title,
            argMax(artist_name, score) AS artist_name,
            argMax(album_title, score) AS album_title,
            argMax(label_name, score) AS label_name
          FROM (
            SELECT
              trimBoth(toString(isrc)) AS isrc,
              trimBoth(toString(upc)) AS upc,
              trimBoth(toString(track_title)) AS track_title,
              trimBoth(toString(artist_name)) AS artist_name,
              trimBoth(toString(album_title)) AS album_title,
              trimBoth(toString(label_name)) AS label_name,
              if(track_title != '' AND track_title != 'N/A', 1, 0)
                + if(artist_name != '' AND artist_name != 'N/A', 1, 0)
                + if(album_title != '' AND album_title != 'N/A', 1, 0)
                + if(label_name != '' AND label_name != 'N/A', 1, 0) AS score
            FROM music_analytics.${factTable}
            WHERE (${where})
              AND (trimBoth(toString(isrc)) NOT IN ('', 'N/A', 'NA') OR trimBoth(toString(upc)) NOT IN ('', 'N/A', 'NA'))
          )
          GROUP BY upc, isrc
        `,
				params,
			);
			rows.push(...tableRows);
		}

		return rows;
	}

	private async loadAffectedPeriodsFromClickHouse(
		checkpoints: ReportImportFileCheckpoint[],
	): Promise<Array<{ factTable: string; period: string }>> {
		const periods: Array<{ factTable: string; period: string }> = [];
		const byTable = new Map<string, ReportImportFileCheckpoint[]>();

		for (const checkpoint of checkpoints) {
			const tableCheckpoints = byTable.get(checkpoint.factTable) ?? [];
			tableCheckpoints.push(checkpoint);
			byTable.set(checkpoint.factTable, tableCheckpoints);
		}

		for (const [factTable, tableCheckpoints] of byTable) {
			const { where, params } = this.buildSourceFilter(
				tableCheckpoints,
				factTable,
			);
			const dateColumn =
				factTable === CLICKHOUSE_TABLES.FACT_SALES_REPORT
					? 'reporting_period_start'
					: 'reporting_period';
			const rows = await this.clickHouseService.query<{ period: string }>(
				`
          SELECT DISTINCT substring(toString(${dateColumn}), 1, 7) AS period
          FROM music_analytics.${factTable}
          WHERE (${where})
            AND period != ''
          ORDER BY period ASC
        `,
				params,
			);
			for (const row of rows) {
				if (row.period) periods.push({ factTable, period: row.period });
			}
		}

		return periods;
	}

	private async cleanupR2Files(
		files: Array<{ r2Key?: string }>,
	): Promise<void> {
		for (const file of files) {
			if (!file.r2Key) continue;
			await this.r2Service.deletePrivate(file.r2Key).catch((err) => {
				this.logger.warn(
					`Failed to clean up R2 file ${file.r2Key}: ${err.message}`,
				);
			});
		}
	}

	private async processJob(jobId: string) {
		return this.analyticsProjectionRefreshService.whileCubeViewsPaused(() =>
			this.processOpenedJob(jobId),
		);
	}

	private async processOpenedJob(jobId: string) {
		const tempDir = path.join(os.tmpdir(), 'report-imports', jobId);
		let totalProcessedRows = 0;
		const affectedSalesPeriods = new Set<string>();
		const affectedTrendsPeriods = new Set<string>();
		let importLocks:
			| Awaited<
					ReturnType<ReportImportQueueService['acquireImportLocks']>
			  >
			| undefined;
		const addAffectedPeriod = (factTable: string, period: string) => {
			if (factTable === CLICKHOUSE_TABLES.FACT_SALES_REPORT)
				affectedSalesPeriods.add(period);
			else affectedTrendsPeriods.add(period);
		};

		try {
			const currentJob =
				this.importJobsService.getSnapshot(jobId) ??
				(await this.importJobsService.findById(jobId));
			if (
				currentJob &&
				currentJob.status !== ImportJobStatus.PENDING &&
				currentJob.status !== ImportJobStatus.QUEUED &&
				currentJob.status !== ImportJobStatus.PROCESSING
			) {
				this.logger.warn(
					`Skipping queued job ${jobId} because current status is ${currentJob.status}.`,
				);
				await this.queueService.ackJob(jobId);
				return;
			}

			await this.importJobsService.markProcessing(jobId);
			let job = this.importJobsService.getSnapshot(jobId);
			if (!job) {
				job = await this.importJobsService.findById(jobId);
			}
			if (!job) {
				throw new Error(`Job ${jobId} not found in database.`);
			}

			await fs.promises.mkdir(tempDir, { recursive: true });
			const bucketName = this.r2Service.getBucketName({
				isPublic: false,
			});
			const files = (job.params?.files as any[]) || [];
			importLocks = await this.queueService.acquireImportLocks(
				files.map((file) =>
					JSON.stringify([
						job.tenantId,
						resolveReportImportSource(file),
						path.posix.basename(file.path.replace(/\\/g, '/')),
					]),
				),
			);
			const labelIdParam = job.params?.labelId;
			const labelId =
				typeof labelIdParam === 'string' ? labelIdParam : undefined;
			const fallbackLabelName =
				await this.resolveFallbackLabelName(labelId);
			const state = this.getReportImportState(job, files);
			await this.saveReportImportState(jobId, state);

			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				const fileKey = this.getFileKey(file);
				const checkpoint = state.files[fileKey];
				const filename = path.posix.basename(
					file.path.replace(/\\/g, '/'),
				);
				const localFilePath = path.join(tempDir, filename);
				const isSales = file.reportType === 'sales';
				const factTable = isSales
					? CLICKHOUSE_TABLES.FACT_SALES_REPORT
					: CLICKHOUSE_TABLES.FACT_DSP_COMPREHENSIVE_REPORT;
				const importSource = resolveReportImportSource(file);

				if (checkpoint?.status === 'FACT_IMPORTED') {
					const stored = await this.clickHouseService.query<{
						rows: string;
					}>(
						`SELECT count() AS rows FROM music_analytics.${factTable} WHERE source_file_name = {filename:String} AND import_source = {source:String} AND batch_id = {batchId:String}`,
						{ filename, source: importSource, batchId: jobId },
					);
					if (Number(stored[0]?.rows ?? 0) !== checkpoint.rows)
						throw new Error(
							`Imported file has been replaced or changed by another job: ${filename}. Start a new upload.`,
						);
					this.logger.log(
						`Skipping ${filename}; fact rows already imported for job ${jobId}`,
					);
					totalProcessedRows += checkpoint.rows;
					await this.importJobsService.updateProgress(
						jobId,
						{
							progressCurrent: i + 1,
							processedRows: totalProcessedRows,
							totalRows: totalProcessedRows,
							progressLabel: `Imported: ${filename}`,
						},
						true,
					);
					continue;
				}

				state.stage = 'FACT_IMPORT';
				state.files[fileKey] = {
					status: 'IMPORTING',
					tenantId: job.tenantId,
					sourceFileName: filename,
					importSource,
					factTable,
					rows: 0,
					affectedPeriods: checkpoint?.affectedPeriods || [],
					parserCode: file.parserCode,
					updatedAt: new Date().toISOString(),
				};
				await this.saveReportImportState(jobId, state);

				this.logger.log(`Downloading ${filename} from R2...`);
				await this.importJobsService.updateProgress(
					jobId,
					{
						progressCurrent: i,
						progressLabel: `Downloading: ${filename}`,
					},
					true,
				);

				// Download from R2 to local temp disk
				const stream = await this.r2Service.getObjectStream({
					bucketName,
					key: file.r2Key,
				});
				const writeStream = fs.createWriteStream(localFilePath);
				await pipeline(stream, writeStream);
				if (
					![
						'configured-report-sales',
						'wmg-sales',
						'spotify-report-sales',
					].includes(file.parserCode)
				)
					throw new Error(
						`Unsupported parser code: ${file.parserCode}`,
					);
				if (
					typeof file.size === 'number' &&
					(await fs.promises.stat(localFilePath)).size !== file.size
				)
					throw new Error(
						`Downloaded file size mismatch: ${filename}`,
					);
				const configuredParser =
					file.parserCode === 'configured-report-sales'
						? new ConfiguredReportSalesParser(
								file as ReportSourceConfig,
							)
						: undefined;
				let validation: ReportValidationSummary | undefined;
				if (configuredParser) {
					await this.importJobsService.updateProgress(
						jobId,
						{ progressLabel: `Validating: ${filename}` },
						true,
					);
					validation =
						await configuredParser.validateFile(localFilePath);
					state.files[fileKey].validation = validation;
					await this.saveReportImportState(jobId, state);
				}
				await importLocks.assertHeld();

				const deletedPeriods = [
					...new Set([
						...(checkpoint?.affectedPeriods || []),
						...(await this.deleteFactRowsForFile(
							factTable,
							filename,
							importSource,
							job.tenantId,
						)),
					]),
				];
				for (const period of deletedPeriods)
					addAffectedPeriod(factTable, period);

				// 2. Parse and batch stream import
				this.logger.log(`Streaming import for file: ${filename}`);
				await this.importJobsService.updateProgress(
					jobId,
					{
						progressLabel: `Importing: ${filename}`,
					},
					true,
				);

				let fileProcessedRows = 0;
				const fileAffectedPeriods = new Set<string>();
				const fileDspIds = new Set<string>();
				let parseStats = { totalRows: 0, skippedRows: 0 };
				const onBatch = async (batch: FactSalesRow[]) => {
					await importLocks!.assertHeld();
					for (const row of batch) {
						row.import_source = importSource;
						row.source_file_name = filename;
						row.ingest_tenant_id = job.tenantId || '';
						row.ingest_label_id = labelId || '';
						if (
							file.parserCode === 'wmg-sales' ||
							!hasMeaningfulText(row.label_name)
						)
							row.label_name = fallbackLabelName || 'N/A';
						normalizeFactRows([row]);
						const period = row.reporting_period_start.slice(0, 7);
						fileAffectedPeriods.add(period);
						addAffectedPeriod(factTable, period);
						fileDspIds.add(row.dsp_id);
					}
					// Persist periods before the write so retry can rebuild even after a crash.
					state.files[fileKey].affectedPeriods = [
						...new Set([...deletedPeriods, ...fileAffectedPeriods]),
					];
					await this.saveReportImportState(jobId, state);
					await this.clickHouseService.insertBatched(
						factTable,
						batch as unknown as Record<string, unknown>[],
						50000,
					);
					fileProcessedRows += batch.length;
					totalProcessedRows += batch.length;
					await this.importJobsService.updateProgress(jobId, {
						processedRows: totalProcessedRows,
						totalRows: validation
							? totalProcessedRows -
								fileProcessedRows +
								validation.totalRows
							: totalProcessedRows,
					});
				};
				if (configuredParser && validation) {
					const dspIds = new Map<string, string>();
					for (const name of validation.dsps) {
						const dsp =
							await this.dspMappingService.resolveOrCreateDspReport(
								name,
								importSource,
							);
						dspIds.set(name, dsp.id_dsps_report);
					}
					parseStats = await configuredParser.parseFileStreaming(
						localFilePath,
						jobId,
						onBatch,
						{ batchSize: 50000, dspIds },
					);
					const totals = await this.clickHouseService.query<{
						rows: string;
						revenue: string;
					}>(
						`SELECT count() AS rows, toString(sum(revenue_usd)) AS revenue FROM music_analytics.${factTable}
						 WHERE source_file_name = {filename:String} AND import_source = {source:String} AND batch_id = {batchId:String}`,
						{ filename, source: importSource, batchId: jobId },
					);
					if (
						Number(totals[0]?.rows) !== validation.totalRows ||
						reportDecimalUnits(totals[0]?.revenue || '0') !==
							reportDecimalUnits(validation.revenueUsd)
					)
						throw new Error(
							`Revenue reconciliation failed: ${filename}`,
						);
				} else if (file.parserCode === 'wmg-sales') {
					parseStats = await new WmgSalesParser().parseFileStreaming(
						localFilePath,
						jobId,
						onBatch,
						{
							batchSize: 50000,
							resolveDspId: async (name) =>
								(
									await this.dspMappingService.resolveOrCreateDspReport(
										name,
										importSource,
									)
								).id_dsps_report,
							revenueCurrency: file.defaultCurrency || 'VND',
							memberName: file.defaultMember || 'AMG GROUP',
						},
					);
				} else if (file.parserCode === 'spotify-report-sales') {
					const dsp =
						await this.dspMappingService.resolveOrCreateDspReport(
							'Spotify',
							importSource,
						);
					parseStats =
						await new SpotifyReportSalesParser().parseFileStreaming(
							localFilePath,
							jobId,
							async (batch) => {
								for (const row of batch)
									row.dsp_id = dsp.id_dsps_report;
								await onBatch(batch);
							},
							{
								batchSize: 50000,
								memberName:
									file.defaultMember || 'ANT MUSIC LLC',
							},
						);
				} else
					throw new Error(
						`Unsupported parser code: ${file.parserCode}`,
					);

				// Delete processed local file
				await fs.promises.unlink(localFilePath).catch(() => {});

				// Write per-file record to etl_import_history
				const fileStartedAt = state.files[fileKey]?.updatedAt;
				// affectedPeriods format: "YYYY-MM" → convert to YYYYMM
				const firstPeriod =
					Array.from(fileAffectedPeriods).sort()[0] ?? '';
				const periodYYYYMM = firstPeriod.replace('-', '');
				const fileCategory = file.reportType ?? 'sales';
				await this.etlImportHistoryRepository
					.upsert({
						job_id: jobId,
						batch_id: jobId,
						period: periodYYYYMM,
						source_type: ImportJobSourceType.REPORT_UPLOAD,
						category: fileCategory,
						dsp_folder: file.parserCode ?? '',
						file_name: filename,
						file_directory: `${fileCategory}/${file.parserCode ?? ''}`,
						file_path: `${fileCategory}/${file.parserCode ?? ''}/${filename}`,
						status: 'done',
						file_size_bytes:
							typeof file.size === 'number' ? file.size : 0,
						total_lines:
							parseStats.totalRows + parseStats.skippedRows,
						processed_rows: fileProcessedRows,
						skipped_rows: parseStats.skippedRows,
						error_rows: 0,
						duration_ms: fileStartedAt
							? Date.now() - new Date(fileStartedAt).getTime()
							: 0,
					})
					.catch((err) =>
						this.logger.warn(
							`Failed to write etl_import_history for ${filename}: ${(err as Error).message}`,
						),
					);

				state.files[fileKey] = {
					status: 'FACT_IMPORTED',
					tenantId: job.tenantId,
					sourceFileName: filename,
					importSource,
					parserCode: file.parserCode,
					factTable,
					rows: fileProcessedRows,
					affectedPeriods: [
						...new Set([...deletedPeriods, ...fileAffectedPeriods]),
					],
					validation,
					skippedRows: parseStats.skippedRows,
					dspIds: [...fileDspIds],
					updatedAt: new Date().toISOString(),
				};
				await this.saveReportImportState(jobId, state);
			}

			const importedCheckpoints = this.getImportedFileCheckpoints(state);

			const metadataCheckpoints: ReportImportFileCheckpoint[] = [];
			for (const checkpoint of importedCheckpoints) {
				const dspRows = await this.clickHouseService.query<{
					dsp_id: string;
				}>(
					`SELECT DISTINCT dsp_id FROM music_analytics.${checkpoint.factTable} WHERE source_file_name = {filename:String} AND import_source = {source:String}${checkpoint.factTable === CLICKHOUSE_TABLES.FACT_SALES_REPORT ? ' AND ingest_tenant_id = {tenantId:String}' : ''}`,
					{
						filename: checkpoint.sourceFileName,
						source: checkpoint.importSource,
						tenantId: checkpoint.tenantId,
					},
				);
				for (const dsp of dspRows)
					metadataCheckpoints.push({
						...checkpoint,
						metadataDspId: dsp.dsp_id,
					});
			}

			// 3. Extract and import entities into PostgreSQL
			const entityResult = {
				totalReleases: 0,
				created: 0,
				skipped: 0,
				errors: 0,
				inDb: 0,
				pending: 0,
			};

			const totalMetadataRows = metadataCheckpoints.reduce(
				(sum, checkpoint) => sum + checkpoint.rows,
				0,
			);
			if (totalMetadataRows > 0) {
				state.stage = 'METADATA_IMPORT';
				await this.saveReportImportState(jobId, state);

				this.logger.log(
					`Extracting and importing metadata entities to PostgreSQL for ${metadataCheckpoints.length} file(s)...`,
				);
				await this.importJobsService.updateProgress(
					jobId,
					{
						progressCurrent: 0,
						progressTotal: metadataCheckpoints.length,
						progressLabel: `Importing metadata to PostgreSQL`,
					},
					true,
				);

				for (
					let index = 0;
					index < metadataCheckpoints.length;
					index += 1
				) {
					const checkpoint = metadataCheckpoints[index];

					const dspId = checkpoint.metadataDspId;

					let pgUuid: string | null = null;
					let dspType: 'audio' | 'video' = 'audio';

					if (dspId) {
						const dspsReport =
							await this.dspMappingService.getDspsReportById(
								dspId,
							);
						if (dspsReport && dspsReport.pg_uuid) {
							pgUuid = dspsReport.pg_uuid;
							const pgDsp =
								await this.dspMappingService.getPgDspsSyncByUuid(
									pgUuid,
								);
							if (pgDsp) {
								dspType =
									(pgDsp.type as 'audio' | 'video') ||
									'audio';
							}
						}
					}

					let dryRun = false;
					if (!pgUuid) {
						this.logger.log(
							`Skipping metadata import for checkpoint ${checkpoint.sourceFileName} as it has no assigned Postgres DSP (pg_uuid is empty). Status is kept as Pending.`,
						);
						dryRun = true;
					}

					const rowsToImport =
						await this.loadMetadataRowsFromClickHouse([checkpoint]);
					if (!rowsToImport.length) continue;

					const result = await this.reportEntityExtractorService
						.extractAndImport(
							rowsToImport,
							job.tenantId, // The default tenant ID chosen on pre-validate upload form
							labelId,
							async (progress) => {
								if (!dryRun) {
									await this.importJobsService.updateProgress(
										jobId,
										{
											progressCurrent: progress.current,
											progressTotal: progress.total,
											progressLabel: progress.label,
										},
										true,
									);
								}
							},
							{
								sourceType: ImportJobSourceType.REPORT_UPLOAD,
								parserCode: checkpoint.parserCode,
								fileName: checkpoint.sourceFileName,
								jobId,
								dspType,
								dryRun,
								createdBy: job.createdBy,
							},
						)
						.catch((err) => {
							this.logger.error(
								`Failed to extract/import entities to PostgreSQL for ${checkpoint.sourceFileName}: ${err.message}`,
							);
							return {
								totalReleases: 0,
								created: 0,
								skipped: 0,
								errors: 1,
								inDb: 0,
								pending: 0,
							};
						});

					entityResult.totalReleases += result.totalReleases;
					entityResult.created += result.created;
					entityResult.skipped += result.skipped;
					entityResult.errors += result.errors;
					entityResult.inDb += result.inDb;
					entityResult.pending += result.pending;

					await this.importJobsService.updateProgress(
						jobId,
						{
							progressLabel: `Importing metadata to PostgreSQL`,
						},
						true,
					);
				}

				this.logger.log(
					`Entity import completed: ${entityResult.created} created, ` +
						`${entityResult.skipped} skipped, ${entityResult.errors} errors, ` +
						`${entityResult.inDb} inDb, ${entityResult.pending} pending.`,
				);
			}

			for (const checkpoint of importedCheckpoints) {
				for (const period of checkpoint.affectedPeriods)
					addAffectedPeriod(checkpoint.factTable, period);
			}
			for (const item of await this.loadAffectedPeriodsFromClickHouse(
				importedCheckpoints,
			)) {
				addAffectedPeriod(item.factTable, item.period);
			}
			const affectedPeriods = new Set([
				...affectedSalesPeriods,
				...affectedTrendsPeriods,
			]);

			// Refresh only the fact partitions changed by this job, after all files
			// have been imported. This also makes retries after DELETE mutations safe.
			if (affectedPeriods.size > 0) {
				this.logger.log(
					`Refreshing analytics cubes for affected periods: ${Array.from(affectedPeriods).join(', ')}`,
				);
				state.stage = 'CUBE_REBUILD';
				await this.saveReportImportState(jobId, state);
				await this.importJobsService.updateProgress(
					jobId,
					{
						progressLabel: `Refreshing analytics cubes...`,
					},
					true,
				);
				await this.analyticsProjectionRefreshService.refreshAfterFactImport(
					{
						salesPeriods: affectedSalesPeriods,
						trendsPeriods: affectedTrendsPeriods,
					},
				);
			}

			await this.queueService.invalidateAnalyticsCache();
			await importLocks.assertHeld();
			await this.dspReportService.refreshStats([
				...new Set(metadataCheckpoints.map((c) => c.metadataDspId!)),
			]);
			if (entityResult.errors > 0)
				throw new Error(
					'Metadata import failed; retry to resume without importing facts again',
				);
			state.stage = 'COMPLETED';
			await this.saveReportImportState(jobId, state);
			await this.importJobsService.updateProgress(
				jobId,
				{
					processedRows: totalProcessedRows,
					totalRows: importedCheckpoints.reduce(
						(sum, c) => sum + c.rows + (c.skippedRows || 0),
						0,
					),
					skippedRows: importedCheckpoints.reduce(
						(sum, c) => sum + (c.skippedRows || 0),
						0,
					),
				},
				true,
			);

			// Mark Job as COMPLETED
			await this.importJobsService.markCompleted(jobId, {
				totalProcessedRows,
				affectedPeriods: Array.from(affectedPeriods),
				files: importedCheckpoints.map(
					({
						sourceFileName,
						importSource,
						rows,
						validation,
						skippedRows,
						affectedPeriods,
					}) => ({
						sourceFileName,
						importSource,
						rows,
						validation,
						skippedRows,
						affectedPeriods,
					}),
				),
				releases: {
					total: entityResult.totalReleases,
					imported: entityResult.created,
					skipped: entityResult.skipped,
					errors: entityResult.errors,
					inDb: entityResult.inDb,
					pending: entityResult.pending,
				},
			});

			await this.cleanupR2Files(files);

			// Ack Job to remove from processing queue
			await this.queueService.ackJob(jobId);
		} catch (err) {
			this.logger.error(
				`Failed to process Job ${jobId}: ${err.message}`,
				err.stack,
			);
			if (affectedSalesPeriods.size || affectedTrendsPeriods.size) {
				await this.analyticsProjectionRefreshService
					.refreshAfterFactImport({
						salesPeriods: affectedSalesPeriods,
						trendsPeriods: affectedTrendsPeriods,
					})
					.catch((refreshError) =>
						this.logger.error(
							`Failed to refresh analytics cubes after import failure: ${refreshError.message}`,
							refreshError.stack,
						),
					);
				await this.queueService
					.invalidateAnalyticsCache()
					.catch(() => {});
			}

			// Update job status in database to FAILED
			await this.importJobsService
				.markFailed(jobId, err.message)
				.catch((dbErr) => {
					this.logger.error(
						`Failed to update job status to FAILED in ClickHouse: ${dbErr.message}`,
					);
				});

			// Remove from processing queue to prevent loop block
			await this.queueService.ackJob(jobId).catch(() => {});
		} finally {
			await importLocks
				?.release()
				.catch((error) =>
					this.logger.warn(
						`Could not release report locks: ${error.message}`,
					),
				);
			// Clean up temp directory
			await fs.promises
				.rm(tempDir, { recursive: true, force: true })
				.catch(() => {});
		}
	}
}
