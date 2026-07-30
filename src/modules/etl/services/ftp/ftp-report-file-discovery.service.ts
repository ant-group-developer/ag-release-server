import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { v4 as uuidv4 } from 'uuid';
import { CLICKHOUSE_TABLES, ClickHouseMigrationService, ClickHouseService } from '../../../clickhouse';
import { FtpSourceCategory } from '../../../dsp-report/dto/ftp-parser-config.dto';
import { FtpReportFileRuleService } from '../../../dsp-report/services/ftp-report-file-rule.service';
import { FtpParserConfigService } from '../../../dsp-report/services/ftp-parser-config.service';
import { FtpService } from './ftp.service';

const CATEGORIES = Object.values(FtpSourceCategory);
const JOB_NAME = 'ftp-report-file-discovery';

@Injectable()
export class FtpReportFileDiscoveryService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(FtpReportFileDiscoveryService.name);
	private running = false;
	private scheduledCron = '';
	private configRefreshTimer: NodeJS.Timeout | null = null;

	constructor(
		private readonly ftpService: FtpService,
		private readonly ruleService: FtpReportFileRuleService,
		private readonly parserConfigService: FtpParserConfigService,
		private readonly clickHouseService: ClickHouseService,
		private readonly migrationService: ClickHouseMigrationService,
		private readonly schedulerRegistry: SchedulerRegistry,
	) {}

	onModuleInit(): void {
		if (process.env.APP_ROLE !== 'worker') return;
		void this.initialize().catch((error) =>
			this.logger.error(`FTP discovery worker initialization failed: ${error.message}`, error.stack),
		);
	}

	onModuleDestroy(): void {
		if (this.configRefreshTimer) clearInterval(this.configRefreshTimer);
	}

	async start(): Promise<{ id: string; status: 'running' }> {
		if (this.running) throw new Error('FTP report-file discovery is already running');
		this.running = true;
		const id = uuidv4();
		const startedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
		await this.clickHouseService.insert(CLICKHOUSE_TABLES.FTP_REPORT_FILE_SCAN_RUNS, [{
			id, source: 'ftp', status: 'running', periods_scanned: 0, folders_scanned: 0,
			files_scanned: 0, patterns_upserted: 0, error_message: '', started_at: startedAt,
			completed_at: startedAt, updated_at: startedAt,
		}]);
		void this.execute(id, startedAt);
		return { id, status: 'running' };
	}

	async getRun(id: string): Promise<unknown | null> {
		const rows = await this.clickHouseService.query(
			`SELECT * FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_SCAN_RUNS} FINAL WHERE id = {id:String} LIMIT 1`,
			{ id },
		);
		return rows[0] || null;
	}

	async getConfig(): Promise<{ cron: string; isEnabled: boolean }> {
		const rows = await this.clickHouseService.query<any>(
			`SELECT * FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_DISCOVERY_CONFIG} FINAL WHERE id = 'default' LIMIT 1`,
		);
		return { cron: rows[0]?.cron || '0 1 * * *', isEnabled: Number(rows[0]?.is_enabled ?? 1) === 1 };
	}

	async setConfig(cron: string, isEnabled: boolean): Promise<{ cron: string; isEnabled: boolean }> {
		try { new CronJob(cron, () => undefined); } catch { throw new BadRequestException('cron must be a valid cron expression'); }
		await this.clickHouseService.insert(CLICKHOUSE_TABLES.FTP_REPORT_FILE_DISCOVERY_CONFIG, [{
			id: 'default', cron, is_enabled: isEnabled ? 1 : 0,
			updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
		}]);
		await this.refreshSchedule();
		return { cron, isEnabled };
	}

	private async execute(id: string, startedAt: string): Promise<void> {
		try {
			const remoteFolders = await this.ftpService.listAllRemoteReportFiles(CATEGORIES);
			const periods = new Set(remoteFolders.map((item) => item.period));
			const observations = new Map<string, { category: FtpSourceCategory; folder: string; pattern: string; files: Set<string>; periods: Set<string> }>();
			const folders = remoteFolders.length;
			let files = 0;
			for (const remoteFolder of remoteFolders) {
				const category = remoteFolder.category as FtpSourceCategory;
				for (const name of remoteFolder.files) {
					files++;
						const pattern = this.toFilePattern(name);
						const key = `${category}|${remoteFolder.dspFolder}|${pattern}`;
						const item = observations.get(key) || { category, folder: remoteFolder.dspFolder, pattern, files: new Set<string>(), periods: new Set<string>() };
						item.files.add(name); item.periods.add(remoteFolder.period); observations.set(key, item);
				}
			}
			const existing = await this.clickHouseService.query<any>(
				`SELECT source_category, dsp_folder, file_name_pattern, first_seen_at FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_CATALOG} FINAL WHERE source = 'ftp'`,
			);
			const existingFirstSeen = new Map(existing.map((row) => [`${row.source_category}|${row.dsp_folder}|${row.file_name_pattern}`, row.first_seen_at]));
			const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
			const rows = Array.from(observations.values()).map((item) => ({
				source: 'ftp', source_category: item.category, dsp_folder: item.folder,
				file_name_pattern: item.pattern, sample_file_paths: Array.from(item.files).sort().slice(0, 20),
				observed_file_count: item.files.size, observed_period_count: item.periods.size,
				first_seen_at: existingFirstSeen.get(`${item.category}|${item.folder}|${item.pattern}`) || now,
				last_seen_at: now, last_scan_id: id, updated_at: now,
			}));
			if (rows.length) await this.clickHouseService.insert(CLICKHOUSE_TABLES.FTP_REPORT_FILE_CATALOG, rows);
			const byFolder = new Map<string, { category: FtpSourceCategory; folder: string; patterns: Array<{ pattern: string; samples: string[] }> }>();
			for (const item of observations.values()) {
				const key = `${item.category}|${item.folder}`;
				const group = byFolder.get(key) || { category: item.category, folder: item.folder, patterns: [] };
				group.patterns.push({ pattern: item.pattern, samples: Array.from(item.files) });
				byFolder.set(key, group);
			}
			for (const group of byFolder.values()) await this.ruleService.ensureDiscoveredRules('ftp', group.category, group.folder, group.patterns);
			await this.finishRun(id, startedAt, 'completed', periods.size, folders, files, rows.length);
			this.logger.log(`FTP discovery completed: ${periods.size} periods, ${folders} folders, ${files} files, ${rows.length} patterns`);
		} catch (error) {
			await this.finishRun(id, startedAt, 'failed', 0, 0, 0, 0, error.message).catch(() => undefined);
			this.logger.error(`FTP discovery ${id} failed: ${error.message}`, error.stack);
		} finally { this.running = false; }
	}

	private async initialize(): Promise<void> {
		await this.migrationService.waitForMigrations();
		// OnModuleInit runs before OnApplicationBootstrap. Ensure parser codes are
		// present before legacy rules are promoted to import during first scan.
		await this.parserConfigService.syncParserCatalog();
		await this.refreshSchedule();
		await this.start();
		this.configRefreshTimer = setInterval(() => void this.refreshSchedule(), 60_000);
		this.configRefreshTimer.unref();
	}

	private async refreshSchedule(): Promise<void> {
		if (process.env.APP_ROLE !== 'worker') return;
		const config = await this.getConfig();
		const next = config.isEnabled ? config.cron : '';
		if (next === this.scheduledCron) return;
		if (this.schedulerRegistry.getCronJobs().has(JOB_NAME)) this.schedulerRegistry.deleteCronJob(JOB_NAME);
		this.scheduledCron = next;
		if (!next) { this.logger.log('FTP report-file discovery schedule disabled'); return; }
		const job = new CronJob(next, () => void this.start().catch((error) => this.logger.error(`Scheduled FTP discovery failed: ${error.message}`, error.stack)), null, false, 'Asia/Ho_Chi_Minh');
		this.schedulerRegistry.addCronJob(JOB_NAME, job); job.start();
		this.logger.log(`FTP report-file discovery scheduled: ${next}`);
	}

	private async finishRun(id: string, startedAt: string, status: string, periods: number, folders: number, files: number, patterns: number, error = ''): Promise<void> {
		const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
		await this.clickHouseService.insert(CLICKHOUSE_TABLES.FTP_REPORT_FILE_SCAN_RUNS, [{
			id, source: 'ftp', status, periods_scanned: periods, folders_scanned: folders,
			files_scanned: files, patterns_upserted: patterns, error_message: error,
			started_at: startedAt, completed_at: now, updated_at: now,
		}]);
	}

	private toFilePattern(fileName: string): string {
		let value = fileName
			.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '__UUID__')
			.replace(/\b(?:19|20)\d{2}[01]\d[0-3]\d\b/g, '__DATE8__')
			.replace(/\b(?:19|20)\d{2}[01]\d\b/g, '__DATE6__')
			.replace(/\b\d{4,}\b/g, '__NUMBER__');
		value = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		return `^${value.replace(/__UUID__/g, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}').replace(/__DATE8__/g, '\\d{8}').replace(/__DATE6__/g, '\\d{6}').replace(/__NUMBER__/g, '\\d+')}$`;
	}
}
