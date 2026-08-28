import {
	Injectable,
	Logger,
	OnApplicationBootstrap,
	OnApplicationShutdown,
} from '@nestjs/common';
import { ClickHouseMigrationService } from '../../../clickhouse';
import {
	ImportJob,
	ImportJobSourceType,
	ImportJobStatus,
} from '../../interfaces';
import { ImportJobsService } from '../import-jobs/import-jobs.service';
import { FtpService, FtpSession } from '../ftp/ftp.service';
import { FtpSyncQueueService } from './ftp-sync-queue.service';
import { SyncService } from './sync.service';

type FtpCategory = 'trends' | 'usage' | 'sales' | 'illegitimate_activity';

@Injectable()
export class FtpSyncWorkerService
	implements OnApplicationBootstrap, OnApplicationShutdown
{
	private readonly logger = new Logger(FtpSyncWorkerService.name);
	private isRunning = true;
	private workerPromise: Promise<void> | null = null;

	constructor(
		private readonly queueService: FtpSyncQueueService,
		private readonly importJobsService: ImportJobsService,
		private readonly syncService: SyncService,
		private readonly ftpService: FtpService,
		private readonly clickHouseMigrationService: ClickHouseMigrationService,
	) {}

	onApplicationBootstrap() {
		if (process.env.APP_ROLE !== 'worker') {
			this.logger.debug('Skipping FTP sync worker loop (not worker role)');
			return;
		}
		this.initializeWorkerInBackground().catch((err) => {
			this.logger.error(
				`Failed to initialize FTP sync worker: ${err.message}`,
				err.stack,
			);
		});
	}

	private async initializeWorkerInBackground() {
		await this.clickHouseMigrationService.waitForMigrations();
		await this.queueService.redeliverStuckJobs().catch((err) => {
			this.logger.error(
				`Failed to redeliver stuck FTP sync jobs: ${err.message}`,
			);
		});
		await this.recoverQueuedJobs().catch((err) => {
			this.logger.error(
				`Failed to recover FTP sync jobs: ${err.message}`,
			);
		});
		this.workerPromise = this.runWorkerLoop();
	}

	async onApplicationShutdown() {
		this.logger.log('Stopping FTP sync worker...');
		this.isRunning = false;
		if (this.workerPromise) await this.workerPromise;
	}

	private async runWorkerLoop() {
		this.logger.log('FTP sync worker loop started');
		while (this.isRunning) {
			try {
				const jobId = await this.queueService.popJob();
				if (!jobId) {
					await this.sleep(2000);
					continue;
				}
				this.logger.log(`FTP sync worker picked up job ${jobId}`);
				await this.processJob(jobId);
			} catch (err) {
				this.logger.error(
					`Error in FTP sync worker loop: ${(err as Error).message}`,
					(err as Error).stack,
				);
				await this.sleep(2000);
			}
		}
	}

	private async recoverQueuedJobs(): Promise<void> {
		const jobs = await this.importJobsService.findRecoverableFtpSyncJobs();
		if (!jobs.length) return;
		this.logger.warn(
			`Recovering ${jobs.length} FTP sync job(s) after startup`,
		);
		for (const job of jobs) {
			if (await this.queueService.hasJob(job.id)) continue;
			await this.queueService.pushJob(job.id);
		}
	}

	private async processJob(jobId: string): Promise<void> {
		let requeued = false;
		try {
			const job = await this.importJobsService.findById(jobId);
			if (!job) {
				this.logger.warn(
					`FTP sync job ${jobId} not visible in ClickHouse yet; requeueing`,
				);
				await this.queueService.nackJob(jobId);
				requeued = true;
				return;
			}
			if (
				job.status === ImportJobStatus.COMPLETED ||
				job.status === ImportJobStatus.FAILED ||
				job.status === ImportJobStatus.CANCELLED
			) {
				this.logger.log(
					`FTP sync job ${jobId} already ${job.status}; acking`,
				);
				return;
			}
			await this.dispatch(job);
		} catch (err) {
			this.logger.error(
				`FTP sync job ${jobId} crashed: ${(err as Error).message}`,
				(err as Error).stack,
			);
			await this.importJobsService
				.markFailed(jobId, err as Error)
				.catch(() => undefined);
		} finally {
			if (!requeued) await this.queueService.ackJob(jobId);
		}
	}

	private async dispatch(job: ImportJob): Promise<void> {
		const params = job.params ?? {};
		const categories = params.categories as FtpCategory[] | undefined;
		const force = Boolean(params.force);

		switch (job.sourceType) {
			case ImportJobSourceType.FTP_RETRY: {
				const period = String(params.period ?? '');
				await this.executeSyncPeriodJob(
					job.id,
					period,
					true,
					categories,
				);
				return;
			}
			case ImportJobSourceType.FTP_AUTO_CRON:
			case ImportJobSourceType.FTP_SYNC_ALL:
				await this.executeSyncAllJob(job.id);
				return;
			case ImportJobSourceType.FTP_SYNC_PERIOD:
			default: {
				const periods = Array.isArray(params.periods)
					? (params.periods as string[])
					: [];
				await this.executeSyncRangeJob(
					job.id,
					periods,
					force,
					categories,
				);
			}
		}
	}

	async executeSyncPeriodJob(
		jobId: string,
		period: string,
		force: boolean,
		categories?: FtpCategory[],
	): Promise<void> {
		try {
			await this.importJobsService.markProcessing(jobId);
			await this.importJobsService.updateProgress(
				jobId,
				{
					progressTotal: 1,
					progressCurrent: 0,
					progressLabel: `Syncing ${period}`,
				},
				true,
			);
			const result = await this.syncService.syncPeriod(
				period,
				force,
				categories,
				jobId,
			);
			await this.importJobsService.updateProgress(
				jobId,
				{
					progressTotal: 1,
					progressCurrent: 1,
					progressLabel: 'Done',
				},
				true,
			);
			await this.importJobsService.markCompleted(jobId, {
				...(result as any),
				releases: result.releases,
			});
		} catch (err) {
			await this.importJobsService.markFailed(jobId, err);
		}
	}

	async executeSyncRangeJob(
		jobId: string,
		periods: string[],
		force: boolean,
		categories?: FtpCategory[],
		session?: FtpSession,
	): Promise<void> {
		if (session) {
			await this.runRange(jobId, periods, force, categories, session);
			return;
		}
		await this.ftpService.withSession(
			(owned) => this.runRange(jobId, periods, force, categories, owned),
			'ftp-sync-range',
		);
	}

	private async runRange(
		jobId: string,
		periods: string[],
		force: boolean,
		categories: FtpCategory[] | undefined,
		session: FtpSession,
	): Promise<void> {
		try {
			await this.importJobsService.markProcessing(jobId);
			await this.importJobsService.updateProgress(
				jobId,
				{
					progressTotal: periods.length,
					progressCurrent: 0,
					progressLabel: `Starting sync for ${periods.length} period(s)...`,
				},
				true,
			);

			const results: unknown[] = [];
			let totalRows = 0;
			let totalFolderErrors = 0;
			const releases = {
				total: 0,
				imported: 0,
				skipped: 0,
				errors: 0,
				inDb: 0,
				pending: 0,
			};
			for (let i = 0; i < periods.length; i++) {
				const period = periods[i];
				await this.importJobsService.updateProgress(
					jobId,
					{
						progressCurrent: i,
						progressLabel: `Syncing ${period}...`,
					},
					true,
				);
				try {
					const result = await this.syncService.syncPeriod(
						period,
						force,
						categories,
						jobId,
						session,
					);
					results.push(result);
					if (result && typeof result.totalRows === 'number') {
						totalRows += result.totalRows;
					}
					if (result?.releases) {
						releases.total += result.releases.total;
						releases.imported += result.releases.imported;
						releases.skipped += result.releases.skipped;
						releases.errors += result.releases.errors;
						releases.inDb += result.releases.inDb;
						releases.pending += result.releases.pending;
					}
					if (result?.categories) {
						for (const cat of result.categories) {
							totalFolderErrors += cat.folders.filter(
								(f) => f.status === 'error',
							).length;
						}
					}
				} catch (err) {
					totalFolderErrors++;
					results.push({ period, error: (err as Error).message });
				}
			}

			const summary = {
				totalPeriods: periods.length,
				totalRows,
				totalFolderErrors,
				hasWarnings: totalFolderErrors > 0,
				results,
				releases,
			};

			await this.importJobsService.updateProgress(
				jobId,
				{
					progressCurrent: periods.length,
					progressLabel:
						totalFolderErrors > 0
							? `Done with ${totalFolderErrors} warning(s)`
							: 'Done',
				},
				true,
			);
			if (totalFolderErrors > 0) {
				this.logger.warn(
					`Sync completed with ${totalFolderErrors} folder warning(s). Rows imported: ${totalRows}. See result for details.`,
				);
			}
			await this.importJobsService.markCompleted(jobId, summary);
		} catch (err) {
			await this.importJobsService.markFailed(jobId, err);
		}
	}

	private async executeSyncAllJob(jobId: string): Promise<void> {
		try {
			await this.importJobsService.markProcessing(jobId);
			await this.importJobsService.updateProgress(
				jobId,
				{
					progressCurrent: 0,
					progressLabel: 'Auto-sync all periods...',
				},
				true,
			);
			const results = await this.syncService.syncAll(
				false,
				undefined,
				undefined,
				jobId,
				ImportJobSourceType.FTP_AUTO_CRON,
			);
			const totalRows = results.reduce(
				(sum, r) => sum + (r.totalRows ?? 0),
				0,
			);
			const totalFolderErrors = results.reduce(
				(sum, result) =>
					sum +
					(result.categories || []).reduce(
						(categorySum, category) =>
							categorySum +
							category.folders.filter(
								(folder) => folder.status === 'error',
							).length,
						0,
					),
				0,
			);
			await this.importJobsService.markCompleted(jobId, {
				totalPeriods: results.length,
				totalRows,
				totalFolderErrors,
				hasWarnings: totalFolderErrors > 0,
				results,
			});
		} catch (err) {
			await this.importJobsService.markFailed(jobId, err);
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
