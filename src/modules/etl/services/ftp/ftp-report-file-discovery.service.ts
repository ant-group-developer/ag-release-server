import {
	BadRequestException,
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { BucketR2Service } from '../../../bucket2/services/bucket-r2.service';
import {
	CLICKHOUSE_TABLES,
	ClickHouseMigrationService,
	ClickHouseService,
} from '../../../clickhouse';
import { FtpSourceCategory } from '../../../dsp-report/dto/ftp-parser-config.dto';
import { FtpParserConfigService } from '../../../dsp-report/services/ftp-parser-config.service';
import { FtpReportFileRuleService } from '../../../dsp-report/services/ftp-report-file-rule.service';
import { FtpOperationLockService } from './ftp-operation-lock.service';
import { canonicalizeFtpReportFilePattern } from './ftp-report-file-pattern';
import { FtpService } from './ftp.service';

const CATEGORIES = Object.values(FtpSourceCategory);
const JOB_NAME = 'ftp-report-file-discovery';

@Injectable()
export class FtpReportFileDiscoveryService
	implements OnModuleInit, OnModuleDestroy
{
	private readonly logger = new Logger(FtpReportFileDiscoveryService.name);
	private running = false;
	private scheduledCron = '';
	private configRefreshTimer: NodeJS.Timeout | null = null;
	private sampleWorkerTimer: NodeJS.Timeout | null = null;
	private activeLockToken: string | null = null;

	constructor(
		private readonly ftpService: FtpService,
		private readonly ruleService: FtpReportFileRuleService,
		private readonly parserConfigService: FtpParserConfigService,
		private readonly clickHouseService: ClickHouseService,
		private readonly migrationService: ClickHouseMigrationService,
		private readonly schedulerRegistry: SchedulerRegistry,
		private readonly bucketR2Service: BucketR2Service,
		private readonly ftpOperationLockService: FtpOperationLockService,
	) {}

	onModuleInit(): void {
		if (process.env.APP_ROLE !== 'worker') return;
		void this.initialize().catch((error) =>
			this.logger.error(
				`FTP discovery worker initialization failed: ${error.message}`,
				error.stack,
			),
		);
	}

	onModuleDestroy(): void {
		if (this.configRefreshTimer) clearInterval(this.configRefreshTimer);
		if (this.sampleWorkerTimer) clearInterval(this.sampleWorkerTimer);
	}

	async start(
		force = false,
		requestedCategories?: string[],
	): Promise<{
		id: string;
		status: 'running';
		force: boolean;
		categories: FtpSourceCategory[];
	}> {
		if (this.running)
			throw new Error('FTP report-file discovery is already running');
		const categories = this.resolveCategories(requestedCategories);
		if (!categories.length)
			throw new BadRequestException(
				'At least one FTP source category is required',
			);
		const lockToken =
			await this.ftpOperationLockService.tryAcquire('rule-discovery');
		if (!lockToken)
			throw new Error('Another FTP operation is already running');
		this.activeLockToken = lockToken;
		this.running = true;
		const id = uuidv4();
		const startedAt = new Date()
			.toISOString()
			.slice(0, 19)
			.replace('T', ' ');
		try {
			await this.clickHouseService.insert(
				CLICKHOUSE_TABLES.FTP_REPORT_FILE_SCAN_RUNS,
				[
					{
						id,
						source: 'ftp',
						force: force ? 1 : 0,
						source_categories: categories,
						status: 'running',
						periods_scanned: 0,
						folders_scanned: 0,
						files_scanned: 0,
						patterns_upserted: 0,
						error_message: '',
						started_at: startedAt,
						completed_at: startedAt,
						updated_at: startedAt,
					},
				],
			);
		} catch (error) {
			this.running = false;
			this.activeLockToken = null;
			await this.ftpOperationLockService.release(lockToken);
			throw error;
		}
		this.logger.log(`FTP discovery ${id} started`);
		void this.execute(id, startedAt, force, categories);
		return { id, status: 'running', force, categories };
	}

	async getRun(id: string): Promise<unknown | null> {
		const rows = await this.clickHouseService.query(
			`SELECT * FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_SCAN_RUNS} FINAL WHERE id = {id:String} LIMIT 1`,
			{ id },
		);
		return rows[0] || null;
	}

	async canonicalizeLegacyRules(dryRun = true): Promise<unknown> {
		return this.ruleService.canonicalizeLegacyRules('ftp', dryRun);
	}

	/**
	 * Removes only derived FTP discovery data. This intentionally does not
	 * touch scan-run audit records or imported report facts.
	 */
	async resetFtpDiscoveryData(dryRun = true): Promise<{
		dryRun: boolean;
		catalogRecords: number;
		periodObservationRecords: number;
		checkpointRecords: number;
		ruleRecords: number;
		rescanRequired: boolean;
	}> {
		const activeRuns = await this.clickHouseService.query<{ id: string }>(
			`SELECT id FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_SCAN_RUNS} FINAL
			 WHERE source = 'ftp' AND status = 'running'
			   AND started_at >= now() - INTERVAL 2 HOUR
			 LIMIT 1`,
		);
		if (activeRuns.length) {
			throw new BadRequestException(
				`Cannot reset while FTP discovery run ${activeRuns[0].id} is running`,
			);
		}

		const [catalog, periodObservations, checkpoints, rules] =
			await Promise.all([
				this.clickHouseService.query<{ total: string }>(
					`SELECT count() AS total FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_CATALOG} FINAL WHERE source = 'ftp'`,
				),
				this.clickHouseService.query<{ total: string }>(
					`SELECT count() AS total FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_PERIOD_OBSERVATIONS} FINAL WHERE source = 'ftp'`,
				),
				this.clickHouseService.query<{ total: string }>(
					`SELECT count() AS total FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_DISCOVERY_CHECKPOINTS} FINAL WHERE source = 'ftp'`,
				),
				this.clickHouseService.query<{ total: string }>(
					`SELECT count() AS total FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_RULES} FINAL WHERE source = 'ftp'`,
				),
			]);
		const result = {
			dryRun,
			catalogRecords: Number(catalog[0]?.total || 0),
			periodObservationRecords: Number(periodObservations[0]?.total || 0),
			checkpointRecords: Number(checkpoints[0]?.total || 0),
			ruleRecords: Number(rules[0]?.total || 0),
			rescanRequired: true,
		};
		if (dryRun) return result;

		await this.clickHouseService.execute(
			`ALTER TABLE ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_CATALOG} DELETE WHERE source = 'ftp'`,
		);
		await this.clickHouseService.execute(
			`ALTER TABLE ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_PERIOD_OBSERVATIONS} DELETE WHERE source = 'ftp'`,
		);
		await this.clickHouseService.execute(
			`ALTER TABLE ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_DISCOVERY_CHECKPOINTS} DELETE WHERE source = 'ftp'`,
		);
		await this.clickHouseService.execute(
			`ALTER TABLE ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_RULES} DELETE WHERE source = 'ftp'`,
		);
		await Promise.all([
			this.clickHouseService.waitForTableMutations(
				CLICKHOUSE_TABLES.FTP_REPORT_FILE_CATALOG,
				{ commandContains: "source = 'ftp'" },
			),
			this.clickHouseService.waitForTableMutations(
				CLICKHOUSE_TABLES.FTP_REPORT_FILE_PERIOD_OBSERVATIONS,
				{ commandContains: "source = 'ftp'" },
			),
			this.clickHouseService.waitForTableMutations(
				CLICKHOUSE_TABLES.FTP_REPORT_FILE_DISCOVERY_CHECKPOINTS,
				{ commandContains: "source = 'ftp'" },
			),
			this.clickHouseService.waitForTableMutations(
				CLICKHOUSE_TABLES.FTP_REPORT_FILE_RULES,
				{ commandContains: "source = 'ftp'" },
			),
		]);
		this.logger.warn(
			`Reset ${result.catalogRecords} FTP catalog records, ${result.periodObservationRecords} period observations, ${result.checkpointRecords} checkpoints and ${result.ruleRecords} FTP file rules`,
		);
		return result;
	}

	async getConfig(): Promise<{
		cron: string;
		isEnabled: boolean;
		force: boolean;
		categories: string[];
	}> {
		const rows = await this.clickHouseService.query<any>(
			`SELECT * FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_DISCOVERY_CONFIG} FINAL WHERE id = 'default' LIMIT 1`,
		);
		return {
			cron: rows[0]?.cron || '0 1 * * *',
			isEnabled: Number(rows[0]?.is_enabled ?? 1) === 1,
			force: Number(rows[0]?.force ?? 0) === 1,
			categories: (rows[0]?.source_categories || []) as string[],
		};
	}

	async setConfig(
		cron: string,
		isEnabled: boolean,
		force = false,
		categories: string[] = [],
	): Promise<{
		cron: string;
		isEnabled: boolean;
		force: boolean;
		categories: string[];
	}> {
		try {
			new CronJob(cron, () => undefined);
		} catch {
			throw new BadRequestException(
				'cron must be a valid cron expression',
			);
		}
		await this.clickHouseService.insert(
			CLICKHOUSE_TABLES.FTP_REPORT_FILE_DISCOVERY_CONFIG,
			[
				{
					id: 'default',
					cron,
					is_enabled: isEnabled ? 1 : 0,
					force: force ? 1 : 0,
					source_categories: categories,
					updated_at: new Date()
						.toISOString()
						.slice(0, 19)
						.replace('T', ' '),
				},
			],
		);
		await this.refreshSchedule();
		return { cron, isEnabled, force, categories };
	}

	private async execute(
		id: string,
		startedAt: string,
		force: boolean,
		categories: FtpSourceCategory[],
	): Promise<void> {
		try {
			const checkpoints = force
				? new Map<string, string>()
				: await this.getCheckpoints();
			const minimumPeriods = Object.fromEntries(checkpoints.entries());
			const categoryScans =
				await this.ftpService.listAllRemoteReportFiles(
					categories,
					minimumPeriods,
				);
			const missingCategories = categories.filter(
				(category) =>
					!categoryScans.some((scan) => scan.category === category),
			);
			if (missingCategories.length) {
				throw new Error(
					`FTP discovery did not complete categories: ${missingCategories.join(', ')}`,
				);
			}
			const remoteFolders = categoryScans.flatMap((scan) => scan.folders);
			const periods = new Set(remoteFolders.map((item) => item.period));
			const observations = new Map<
				string,
				{
					category: FtpSourceCategory;
					folder: string;
					pattern: string;
					files: Set<string>;
					periods: Set<string>;
				}
			>();
			const periodObservations = new Map<
				string,
				{
					category: FtpSourceCategory;
					folder: string;
					pattern: string;
					period: string;
					files: Set<string>;
				}
			>();
			const folders = remoteFolders.length;
			let files = 0;
			for (const remoteFolder of remoteFolders) {
				const category = remoteFolder.category as FtpSourceCategory;
				for (const name of remoteFolder.files) {
					files++;
					const pattern = this.toFilePattern(name);
					const key = `${category}|${remoteFolder.dspFolder}|${pattern}`;
					const item = observations.get(key) || {
						category,
						folder: remoteFolder.dspFolder,
						pattern,
						files: new Set<string>(),
						periods: new Set<string>(),
					};
					item.files.add(name);
					item.periods.add(remoteFolder.period);
					observations.set(key, item);
					const periodKey = `${key}|${remoteFolder.period}`;
					const periodItem = periodObservations.get(periodKey) || {
						category,
						folder: remoteFolder.dspFolder,
						pattern,
						period: remoteFolder.period,
						files: new Set<string>(),
					};
					periodItem.files.add(name);
					periodObservations.set(periodKey, periodItem);
				}
			}
			const existing = await this.clickHouseService.query<any>(
				`SELECT source_category, dsp_folder, file_name_pattern, period, first_seen_at
				 FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_PERIOD_OBSERVATIONS} FINAL WHERE source = 'ftp'`,
			);
			const existingFirstSeen = new Map(
				existing.map((row) => [
					`${row.source_category}|${row.dsp_folder}|${row.file_name_pattern}|${row.period}`,
					row.first_seen_at,
				]),
			);
			const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
			const sampleTaskCount = await this.enqueueRepresentativeSamples(
				id,
				periodObservations,
			);
			const periodRows = Array.from(periodObservations.values()).map(
				(item) => ({
					source: 'ftp',
					source_category: item.category,
					dsp_folder: item.folder,
					file_name_pattern: item.pattern,
					period: item.period,
					sample_file_paths: Array.from(item.files)
						.sort()
						.slice(0, 20),
					sample_file_refs: [],
					observed_file_count: item.files.size,
					first_seen_at:
						existingFirstSeen.get(
							`${item.category}|${item.folder}|${item.pattern}|${item.period}`,
						) || now,
					last_seen_at: now,
					last_scan_id: id,
					updated_at: now,
				}),
			);
			if (force) await this.replaceForceObservations();
			if (periodRows.length)
				await this.clickHouseService.insert(
					CLICKHOUSE_TABLES.FTP_REPORT_FILE_PERIOD_OBSERVATIONS,
					periodRows,
				);
			const catalogRows =
				await this.replaceCatalogFromPeriodObservations();
			// A territory is encoded inside KKBOX report names (KKBOXHK, KKBOXTW,
			// etc.). Collapse their legacy per-territory rules before discovery
			// checks for existing patterns, so a new territory uses the shared
			// KKBOX[A-Z]{2} import rule instead of becoming pending.
			const canonicalization = await this.ruleService.canonicalizeLegacyRules(
				'ftp',
				false,
			);
			for (const conflict of canonicalization.conflicts)
				this.logger.warn(
					`FTP rule canonicalization skipped ${conflict.canonicalPattern}: ${conflict.reason}`,
				);
			const byFolder = new Map<
				string,
				{
					category: FtpSourceCategory;
					folder: string;
					patterns: Array<{ pattern: string; samples: string[] }>;
				}
			>();
			for (const item of observations.values()) {
				const key = `${item.category}|${item.folder}`;
				const group = byFolder.get(key) || {
					category: item.category,
					folder: item.folder,
					patterns: [],
				};
				group.patterns.push({
					pattern: item.pattern,
					samples: Array.from(item.files),
				});
				byFolder.set(key, group);
			}
			for (const group of byFolder.values()) {
				const ruleResult = await this.ruleService.ensureDiscoveredRules(
					'ftp',
					group.category,
					group.folder,
					group.patterns,
				);
				for (const warning of ruleResult.warnings)
					this.logger.warn(warning);
			}
			await this.saveCheckpoints(id, categoryScans, checkpoints);
			const failedPaths = categoryScans.flatMap(
				(scan) => scan.failedPaths,
			);
			const status = failedPaths.length
				? 'completed_with_warnings'
				: 'completed';
			const errorMessage = failedPaths.length
				? `${failedPaths.length} FTP path(s) could not be listed after retries: ${failedPaths.slice(0, 20).join(', ')}`
				: '';
			await this.finishRun(
				id,
				startedAt,
				status,
				periods.size,
				folders,
				files,
				catalogRows.length,
				errorMessage,
				force,
				categories,
			);
			const categorySummary = categoryScans
				.map(
					(scan) => `${scan.category}=${scan.folders.length} folders`,
				)
				.join(', ');
			const message = `FTP discovery ${status}: ${periods.size} periods, ${folders} folders, ${files} files, ${catalogRows.length} patterns, ${sampleTaskCount} sample tasks (${categorySummary})`;
			if (failedPaths.length)
				this.logger.warn(`${message}; ${errorMessage}`);
			else this.logger.log(message);
		} catch (error) {
			await this.finishRun(
				id,
				startedAt,
				'failed',
				0,
				0,
				0,
				0,
				error.message,
				force,
				categories,
			).catch(() => undefined);
			this.logger.error(
				`FTP discovery ${id} failed: ${error.message}`,
				error.stack,
			);
		} finally {
			this.running = false;
			const lockToken = this.activeLockToken;
			this.activeLockToken = null;
			if (lockToken)
				await this.ftpOperationLockService.release(lockToken);
		}
	}

	private async initialize(): Promise<void> {
		await this.migrationService.waitForMigrations();
		// OnModuleInit runs before OnApplicationBootstrap. Ensure parser codes are
		// present before legacy rules are promoted to import during first scan.
		await this.parserConfigService.syncParserCatalog();
		await this.refreshSchedule();
		this.configRefreshTimer = setInterval(
			() => void this.refreshSchedule(),
			60_000,
		);
		this.configRefreshTimer.unref();
		this.sampleWorkerTimer = setInterval(
			() => void this.processSampleTasks(),
			5_000,
		);
		this.sampleWorkerTimer.unref();
		void this.processSampleTasks();
	}

	private async refreshSchedule(): Promise<void> {
		if (process.env.APP_ROLE !== 'worker') return;
		const config = await this.getConfig();
		const next = config.isEnabled ? config.cron : '';
		if (next === this.scheduledCron) return;
		if (this.schedulerRegistry.getCronJobs().has(JOB_NAME))
			this.schedulerRegistry.deleteCronJob(JOB_NAME);
		this.scheduledCron = next;
		if (!next) {
			this.logger.log('FTP report-file discovery schedule disabled');
			return;
		}
		const job = new CronJob(
			next,
			() =>
				void this.start(config.force, config.categories).catch(
					(error) =>
						this.logger.error(
							`Scheduled FTP discovery failed: ${error.message}`,
							error.stack,
						),
				),
			null,
			false,
			'Asia/Ho_Chi_Minh',
		);
		this.schedulerRegistry.addCronJob(JOB_NAME, job);
		job.start();
		this.logger.log(`FTP report-file discovery scheduled: ${next}`);
	}

	private async getCheckpoints(): Promise<Map<string, string>> {
		const rows = await this.clickHouseService.query<{
			source_category: string;
			last_completed_period: string;
		}>(
			`SELECT source_category, last_completed_period FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_DISCOVERY_CHECKPOINTS} FINAL WHERE source = 'ftp'`,
		);
		return new Map(
			rows
				.filter((row) => row.last_completed_period)
				.map((row) => [row.source_category, row.last_completed_period]),
		);
	}

	private resolveCategories(requested?: string[]): FtpSourceCategory[] {
		if (!requested?.length || requested.includes('all')) return CATEGORIES;
		const categories = requested.filter(
			(category): category is FtpSourceCategory =>
				CATEGORIES.includes(category as FtpSourceCategory),
		);
		if (!categories.length)
			throw new BadRequestException(
				'At least one valid FTP source category is required',
			);
		return [...new Set(categories)];
	}

	private async saveCheckpoints(
		id: string,
		categoryScans: Array<{ category: string; periods: string[] }>,
		existing: Map<string, string>,
	): Promise<void> {
		const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
		const rows = categoryScans.map((scan) => ({
			source: 'ftp',
			source_category: scan.category,
			last_completed_period:
				scan.periods[0] || existing.get(scan.category) || '',
			last_scan_id: id,
			last_scanned_at: now,
			updated_at: now,
		}));
		await this.clickHouseService.insert(
			CLICKHOUSE_TABLES.FTP_REPORT_FILE_DISCOVERY_CHECKPOINTS,
			rows,
		);
	}

	/** A forced scan replaces the derived remote inventory, never admin rules. */
	private async replaceForceObservations(): Promise<void> {
		await this.clickHouseService.execute(
			`ALTER TABLE ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_PERIOD_OBSERVATIONS} DELETE WHERE source = 'ftp'`,
		);
		await this.clickHouseService.waitForTableMutations(
			CLICKHOUSE_TABLES.FTP_REPORT_FILE_PERIOD_OBSERVATIONS,
			{ commandContains: "source = 'ftp'" },
		);
	}

	/**
	 * Rebuild the small UI catalog from idempotent per-period observations.
	 * This avoids corrupting file/period totals when an incremental run revisits
	 * the newest period, while keeping the expensive work on FTP incremental.
	 */
	private async replaceCatalogFromPeriodObservations(): Promise<any[]> {
		const observations = await this.clickHouseService.query<any>(
			`SELECT * FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_PERIOD_OBSERVATIONS} FINAL WHERE source = 'ftp'`,
		);
		const catalog = new Map<string, any>();
		for (const item of observations) {
			const key = `${item.source_category}|${item.dsp_folder}|${item.file_name_pattern}`;
			const current = catalog.get(key) || {
				source: 'ftp',
				source_category: item.source_category,
				dsp_folder: item.dsp_folder,
				file_name_pattern: item.file_name_pattern,
				sample_file_paths: new Set<string>(),
				sample_file_refs: new Map<string, string>(),
				observed_file_count: 0,
				observed_period_count: 0,
				first_seen_at: item.first_seen_at,
				last_seen_at: item.last_seen_at,
				last_scan_id: item.last_scan_id,
				updated_at: item.updated_at,
			};
			for (const sample of item.sample_file_paths || [])
				current.sample_file_paths.add(sample);
			for (const rawRef of item.sample_file_refs || []) {
				try {
					const ref = JSON.parse(rawRef);
					if (ref.r2Key)
						current.sample_file_refs.set(ref.r2Key, rawRef);
				} catch {
					/* ignore malformed legacy sample ref */
				}
			}
			current.observed_file_count += Number(
				item.observed_file_count || 0,
			);
			current.observed_period_count += 1;
			if (item.first_seen_at < current.first_seen_at)
				current.first_seen_at = item.first_seen_at;
			if (item.updated_at >= current.updated_at) {
				current.last_seen_at = item.last_seen_at;
				current.last_scan_id = item.last_scan_id;
				current.updated_at = item.updated_at;
			}
			catalog.set(key, current);
		}
		const rows = Array.from(catalog.values()).map((item) => ({
			...item,
			sample_file_paths: Array.from(item.sample_file_paths)
				.sort()
				.slice(0, 20),
			sample_file_refs: Array.from(item.sample_file_refs.values()).slice(
				0,
				2,
			),
		}));
		await this.clickHouseService.execute(
			`ALTER TABLE ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_CATALOG} DELETE WHERE source = 'ftp'`,
		);
		await this.clickHouseService.waitForTableMutations(
			CLICKHOUSE_TABLES.FTP_REPORT_FILE_CATALOG,
			{ commandContains: "source = 'ftp'" },
		);
		if (rows.length)
			await this.clickHouseService.insert(
				CLICKHOUSE_TABLES.FTP_REPORT_FILE_CATALOG,
				rows,
			);
		return rows;
	}

	private async enqueueRepresentativeSamples(
		runId: string,
		observations: Map<
			string,
			{
				category: FtpSourceCategory;
				folder: string;
				pattern: string;
				period: string;
				files: Set<string>;
			}
		>,
	): Promise<number> {
		const catalog = await this.clickHouseService.query<any>(
			`SELECT source_category, dsp_folder, file_name_pattern, sample_file_refs FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_CATALOG} FINAL WHERE source = 'ftp'`,
		);
		const existingTasks = await this.clickHouseService.query<{
			id: string;
			status: string;
		}>(
			`SELECT id, status FROM ${CLICKHOUSE_TABLES.FTP_REPORT_SAMPLE_TASKS} FINAL WHERE source = 'ftp'`,
		);
		const existingTaskIds = new Set(
			existingTasks
				.filter((task) =>
					['pending', 'processing', 'completed'].includes(
						task.status,
					),
				)
				.map((task) => task.id),
		);
		const completed = new Set(
			catalog
				.filter((r) => (r.sample_file_refs || []).length >= 2)
				.map(
					(r) =>
						`${r.source_category}|${r.dsp_folder}|${r.file_name_pattern}`,
				),
		);
		const tasks: any[] = [];
		const chosen = new Map<string, number>();
		for (const item of Array.from(observations.values()).sort((a, b) =>
			b.period.localeCompare(a.period),
		)) {
			const key = `${item.category}|${item.folder}|${item.pattern}`;
			if (completed.has(key) || (chosen.get(key) || 0) >= 2) continue;
			for (const file of Array.from(item.files).sort()) {
				if ((chosen.get(key) || 0) >= 2) break;
				const id = createHash('sha1')
					.update(`${key}|${item.period}|${file}`)
					.digest('hex');
				if (existingTaskIds.has(id)) continue;
				tasks.push({
					id,
					source: 'ftp',
					source_category: item.category,
					dsp_folder: item.folder,
					file_name_pattern: item.pattern,
					period: item.period,
					ftp_path: file,
					status: 'pending',
					attempt: 0,
					error_message: '',
					r2_key: '',
					created_at: new Date()
						.toISOString()
						.slice(0, 19)
						.replace('T', ' '),
					updated_at: new Date()
						.toISOString()
						.slice(0, 19)
						.replace('T', ' '),
				});
				chosen.set(key, (chosen.get(key) || 0) + 1);
			}
		}
		if (tasks.length)
			await this.clickHouseService.insert(
				CLICKHOUSE_TABLES.FTP_REPORT_SAMPLE_TASKS,
				tasks,
			);
		return tasks.length;
	}

	private async processSampleTasks(): Promise<void> {
		if (process.env.APP_ROLE !== 'worker') return;
		const tasks = await this.clickHouseService.query<any>(
			`SELECT * FROM ${CLICKHOUSE_TABLES.FTP_REPORT_SAMPLE_TASKS} FINAL WHERE status IN ('pending','failed') AND attempt < 3 ORDER BY created_at LIMIT 2`,
		);
		await Promise.all(tasks.map((task) => this.processSampleTask(task)));
	}

	private async processSampleTask(task: any): Promise<void> {
		const now = () =>
			new Date().toISOString().slice(0, 19).replace('T', ' ');
		try {
			await this.clickHouseService.insert(
				CLICKHOUSE_TABLES.FTP_REPORT_SAMPLE_TASKS,
				[
					{
						...task,
						status: 'processing',
						attempt: Number(task.attempt) + 1,
						updated_at: now(),
					},
				],
			);
			const tempDir = await fs.promises.mkdtemp(
				path.join(os.tmpdir(), 'ftp-sample-task-'),
			);
			try {
				const localPath = path.join(
					tempDir,
					createHash('sha1').update(task.id).digest('hex'),
				);
				await this.ftpService.downloadDiscoverySampleFile(
					task.source_category,
					task.period,
					task.dsp_folder,
					task.ftp_path,
					localPath,
				);
				const key = `ftp-report-samples/${task.source_category}/${task.dsp_folder}/${task.id}/${encodeURIComponent(path.basename(task.ftp_path))}`;
				await this.bucketR2Service.uploadFileFromPath({
					key,
					filePath: localPath,
					contentType: 'application/octet-stream',
					isPublic: false,
				});
				await this.clickHouseService.insert(
					CLICKHOUSE_TABLES.FTP_REPORT_SAMPLE_TASKS,
					[
						{
							...task,
							status: 'completed',
							attempt: Number(task.attempt) + 1,
							r2_key: key,
							error_message: '',
							updated_at: now(),
						},
					],
				);
			} finally {
				await fs.promises.rm(tempDir, { recursive: true, force: true });
			}
		} catch (error) {
			await this.clickHouseService.insert(
				CLICKHOUSE_TABLES.FTP_REPORT_SAMPLE_TASKS,
				[
					{
						...task,
						status: 'failed',
						attempt: Number(task.attempt) + 1,
						error_message: error.message,
						updated_at: now(),
					},
				],
			);
		}
	}

	private async uploadRepresentativeSamples(
		observations: Map<
			string,
			{
				category: FtpSourceCategory;
				folder: string;
				pattern: string;
				period: string;
				files: Set<string>;
			}
		>,
	): Promise<Map<string, string[]>> {
		const selected = new Map<
			string,
			Array<{
				periodKey: string;
				category: FtpSourceCategory;
				folder: string;
				period: string;
				file: string;
			}>
		>();
		const existing = await this.clickHouseService.query<any>(
			`SELECT source_category, dsp_folder, file_name_pattern, sample_file_refs FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_CATALOG} FINAL WHERE source = 'ftp'`,
		);
		const existingRefs = new Map(
			existing.map((row) => [
				`${row.source_category}|${row.dsp_folder}|${row.file_name_pattern}`,
				row.sample_file_refs || [],
			]),
		);
		const reused = new Set<string>();
		const result = new Map<string, string[]>();
		for (const item of Array.from(observations.values()).sort((a, b) =>
			b.period.localeCompare(a.period),
		)) {
			const key = `${item.category}|${item.folder}|${item.pattern}`;
			const priorRefs = existingRefs.get(key) || [];
			if (priorRefs.length >= 2) {
				if (!reused.has(key))
					result.set(`${key}|${item.period}`, priorRefs.slice(0, 2));
				reused.add(key);
				continue;
			}
			const files = selected.get(key) || [];
			for (const file of Array.from(item.files).sort()) {
				if (files.length >= 2) break;
				files.push({
					periodKey: `${key}|${item.period}`,
					category: item.category,
					folder: item.folder,
					period: item.period,
					file,
				});
			}
			selected.set(key, files);
		}
		const tempDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), 'ftp-sample-'),
		);
		try {
			for (const samples of selected.values())
				for (const sample of samples)
					try {
						const hash = createHash('sha1')
							.update(
								`${sample.category}/${sample.folder}/${sample.period}/${sample.file}`,
							)
							.digest('hex');
						const localPath = path.join(tempDir, hash);
						await this.ftpService.downloadDiscoverySampleFile(
							sample.category,
							sample.period,
							sample.folder,
							sample.file,
							localPath,
						);
						const key = `ftp-report-samples/${sample.category}/${sample.folder}/${hash}/${encodeURIComponent(path.basename(sample.file))}`;
						await this.bucketR2Service.uploadFileFromPath({
							key,
							filePath: localPath,
							contentType: 'application/octet-stream',
							isPublic: false,
						});
						result.set(sample.periodKey, [
							...(result.get(sample.periodKey) || []),
							JSON.stringify({
								ftpPath: sample.file,
								r2Key: key,
								fileName: path.basename(sample.file),
							}),
						]);
					} catch (error) {
						this.logger.warn(
							`Cannot upload FTP sample ${sample.file}: ${error.message}`,
						);
					}
		} finally {
			await fs.promises.rm(tempDir, { recursive: true, force: true });
		}
		return result;
	}

	private async finishRun(
		id: string,
		startedAt: string,
		status: string,
		periods: number,
		folders: number,
		files: number,
		patterns: number,
		error = '',
		force = false,
		categories: FtpSourceCategory[] = CATEGORIES,
	): Promise<void> {
		const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
		await this.clickHouseService.insert(
			CLICKHOUSE_TABLES.FTP_REPORT_FILE_SCAN_RUNS,
			[
				{
					id,
					source: 'ftp',
					force: force ? 1 : 0,
					source_categories: categories,
					status,
					periods_scanned: periods,
					folders_scanned: folders,
					files_scanned: files,
					patterns_upserted: patterns,
					error_message: error,
					started_at: startedAt,
					completed_at: now,
					updated_at: now,
				},
			],
		);
	}

	private toFilePattern(fileName: string): string {
		const isZipArchive = fileName.toLowerCase().endsWith('.zip');
		const unarchivedFileName = isZipArchive
			? fileName.slice(0, -4)
			: fileName;
		const hasOptionalZipArchive = /\.(csv|txt|tsv)$/i.test(
			unarchivedFileName,
		);
		const normalizedFileName = hasOptionalZipArchive
			? unarchivedFileName
			: fileName;
		// Date tokens can be surrounded by underscores, so word boundaries cannot
		// be used here. Digit boundaries still prevent a date-like substring inside
		// a long timestamp from being treated as a separate YYYYMM/DD token.
		let value = normalizedFileName
			.replace(
				/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
				'__UUID__',
			)
			// KKBOX encodes territory as a suffix of its own identifier, without
			// a separator (for example KKBOXHK). It does not change the schema.
			.replace(
				/KKBOX[A-Z]{2}(?=_\d{6}_Monthly-Sales)/g,
				'KKBOX__COUNTRY_ISO2__',
			)
			.replace(
				/(?<!\d)(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?!\d)/g,
				'__DATE8_DASH__',
			)
			.replace(
				/(?<!\d)(?:19|20)\d{2}-(?:0[1-9]|1[0-2])(?!\d)/g,
				'__YEAR_MONTH__',
			)
			.replace(
				/(?<!\d)(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?!\d)/g,
				'__DATE8__',
			)
			.replace(
				/(?<!\d)(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?!\d)/g,
				'__DATE6__',
			)
			// Uppercase two-letter tokens between path/name separators are ISO-3166
			// territories in provider report names (e.g. _BR_, _DE_, _US_).
			.replace(
				/(?<=[_/])(?:AD|AE|AF|AG|AI|AL|AM|AO|AR|AT|AU|AW|AX|AZ|BA|BB|BD|BE|BF|BG|BH|BI|BJ|BN|BO|BQ|BR|BS|BT|BW|BY|BZ|CA|CD|CF|CG|CH|CI|CL|CM|CN|CO|CR|CU|CV|CW|CY|CZ|DE|DJ|DK|DM|DO|DZ|EC|EE|EG|EH|ER|ES|ET|FI|FJ|FK|FM|FO|FR|GA|GB|GD|GE|GF|GG|GH|GI|GL|GM|GN|GP|GQ|GR|GS|GT|GU|GW|GY|HK|HM|HN|HR|HT|HU|ID|IE|IL|IM|IN|IO|IQ|IR|IS|IT|JE|JM|JO|JP|KE|KG|KH|KI|KM|KN|KP|KR|KW|KY|KZ|LA|LB|LC|LI|LK|LR|LS|LT|LU|LV|LY|MA|MC|MD|ME|MG|MH|MK|ML|MM|MN|MO|MP|MQ|MR|MS|MT|MU|MV|MW|MX|MY|MZ|NA|NC|NE|NF|NG|NI|NL|NO|NP|NR|NU|NZ|OM|PA|PE|PF|PG|PH|PK|PL|PM|PN|PR|PS|PT|PW|PY|QA|RE|RO|RS|RU|RW|SA|SB|SC|SD|SE|SG|SH|SI|SJ|SK|SL|SM|SN|SO|SR|SS|ST|SV|SX|SY|SZ|TC|TD|TF|TG|TH|TJ|TK|TL|TM|TN|TO|TR|TT|TV|TW|TZ|UA|UG|UM|US|UY|UZ|VA|VC|VE|VG|VI|VN|VU|WF|WS|YE|YT|ZA|ZM|ZW)(?=[_/])/g,
				'__COUNTRY_ISO2__',
			)
			.replace(/\d{4,}/g, '__NUMBER__');
		value = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		if (hasOptionalZipArchive) value += '__OPTIONAL_ZIP__';
		return canonicalizeFtpReportFilePattern(
			`^${value
				.replace(
					/__UUID__/g,
					'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
				)
				.replace(/__DATE8_DASH__/g, '\\d{4}-\\d{2}-\\d{2}')
				.replace(/__YEAR_MONTH__/g, '\\d{4}-\\d{2}')
				.replace(/__DATE8__/g, '\\d{8}')
				.replace(/__DATE6__/g, '\\d{6}')
				.replace(/__COUNTRY_ISO2__/g, '[A-Z]{2}')
				.replace(/__NUMBER__/g, '\\d+')
				.replace(/__OPTIONAL_ZIP__/g, '(?:\\.zip)?')}$`,
		);
	}
}
