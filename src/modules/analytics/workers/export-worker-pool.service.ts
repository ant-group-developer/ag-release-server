import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';
import { ImportJobStatus } from 'src/modules/etl/interfaces';
import { ImportJobsService } from 'src/modules/etl/services/import-jobs/import-jobs.service';
import { Worker } from 'worker_threads';
import { AnalyticsReportExportDto } from '../dto/analytics-report-export.dto';
import { ExportProgressPatch } from '../interfaces/analytics-report-export.interface';
import { ExportQueueService } from '../services/export-queue.service';

interface RunningJob {
	worker: Worker;
	cancelFlag: Int32Array;
}

/**
 * ExportWorkerPoolService — quản lý pool worker_threads chạy job export.
 *
 * Thay cho các worker-loop in-process cũ (chạy CPU-bound trên event loop HTTP).
 * Mỗi job được giao cho 1 worker thread riêng → CPU parse/enrich/zip không còn
 * chiếm event loop của HTTP server → API luôn trả response tức thì.
 *
 * Main thread chỉ: dequeue Redis, spawn thread, forward progress→SSE qua
 * ImportJobsService, và xử lý kết quả/lỗi/huỷ.
 */
@Injectable()
export class ExportWorkerPoolService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(ExportWorkerPoolService.name);
	private readonly maxThreads = this.resolveMaxThreads();
	private activeCount = 0;
	private isRunning = false;
	private readonly running = new Map<string, RunningJob>();

	constructor(
		private readonly importJobsService: ImportJobsService,
		private readonly exportQueueService: ExportQueueService,
	) {}

	private resolveMaxThreads(): number {
		const fromEnv = Number(process.env.EXPORT_WORKER_THREADS);
		if (Number.isFinite(fromEnv) && fromEnv >= 1)
			return Math.floor(fromEnv);
		// Mặc định: chừa 1 core cho event loop HTTP.
		return Math.max(1, (os.cpus()?.length ?? 2) - 1);
	}

	async onModuleInit() {
		await this.exportQueueService.redeliverStuck();
		this.isRunning = true;
		this.logger.log(
			`Export worker pool started with ${this.maxThreads} thread(s)`,
		);
		void this.pollLoop();
	}

	async onModuleDestroy() {
		this.isRunning = false;
		for (const [, job] of this.running) {
			await job.worker.terminate().catch(() => undefined);
		}
		this.running.clear();
	}

	/** Yêu cầu huỷ job đang chạy trong thread (set cờ SharedArrayBuffer). */
	requestCancel(jobId: string): void {
		const job = this.running.get(jobId);
		if (job) {
			Atomics.store(job.cancelFlag, 0, 1);
		}
	}

	// PLACEHOLDER_POLL

	private async pollLoop(): Promise<void> {
		while (this.isRunning) {
			if (this.activeCount >= this.maxThreads) {
				await this.sleep(200);
				continue;
			}

			let jobId: string | null = null;
			try {
				jobId = await this.exportQueueService.dequeue();
			} catch (err: any) {
				this.logger.error(`Dequeue error: ${err.message}`);
				await this.sleep(2000);
				continue;
			}

			if (!jobId) {
				await this.sleep(1000);
				continue;
			}

			// Chạy job (không await để tiếp tục dequeue job khác tới khi đầy pool).
			void this.runJob(jobId);
		}
	}

	private async runJob(jobId: string): Promise<void> {
		this.activeCount++;
		try {
			const job = await this.importJobsService.findById(jobId);
			if (!job || this.isTerminalStatus(job.status)) {
				await this.exportQueueService.ack(jobId);
				return;
			}

			await this.importJobsService.markProcessing(jobId);
			await this.spawnAndWait(
				jobId,
				job.tenantId || '',
				job.params as unknown as AnalyticsReportExportDto,
			);
		} catch (err: any) {
			this.logger.error(`Job ${jobId} failed: ${err.message}`, err.stack);
			await this.importJobsService.markFailed(
				jobId,
				err instanceof Error ? err : String(err),
			);
		} finally {
			await this.exportQueueService.ack(jobId).catch(() => undefined);
			this.running.delete(jobId);
			this.activeCount--;
		}
	}

	private spawnAndWait(
		jobId: string,
		tenantId: string,
		dto: AnalyticsReportExportDto,
	): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const cancelFlag = new Int32Array(new SharedArrayBuffer(4));
			const worker = new Worker(this.resolveWorkerPath(), {
				workerData: {
					jobId,
					tenantId,
					dto,
					cancelFlag,
					env: process.env,
				},
				// Cho phép load file .ts qua ts-node ở môi trường dev.
				execArgv: this.resolveExecArgv(),
			});

			this.running.set(jobId, { worker, cancelFlag });
			let settled = false;
			const done = (fn: () => void) => {
				if (settled) return;
				settled = true;
				fn();
			};

			worker.on('message', (msg: any) => {
				void this.handleMessage(jobId, msg, done, resolve, reject);
			});

			worker.on('error', (err) => {
				done(() => reject(err));
			});

			worker.on('exit', (code) => {
				done(() => {
					if (code === 0) resolve();
					else
						reject(
							new Error(`Export worker exited with code ${code}`),
						);
				});
			});
		});
	}

	private async handleMessage(
		jobId: string,
		msg: any,
		done: (fn: () => void) => void,
		resolve: () => void,
		reject: (err: Error) => void,
	): Promise<void> {
		switch (msg?.type) {
			case 'progress':
				await this.importJobsService
					.updateProgress(
						jobId,
						msg.patch as ExportProgressPatch,
						!!msg.force,
					)
					.catch(() => undefined);
				break;
			case 'fileName':
				await this.importJobsService
					.updateFileName(jobId, msg.fileName)
					.catch(() => undefined);
				break;
			case 'done':
				await this.importJobsService
					.markCompleted(jobId, {
						...msg.result,
						totalProcessedRows: msg.result?.totalRows,
					})
					.catch(() => undefined);
				done(resolve);
				break;
			case 'cancelled':
				await this.importJobsService
					.markCancelled(jobId, 'Cancelled by user')
					.catch(() => undefined);
				done(resolve);
				break;
			case 'error':
				await this.importJobsService
					.markFailed(jobId, msg.message || 'Export worker error')
					.catch(() => undefined);
				done(() =>
					reject(new Error(msg.message || 'Export worker error')),
				);
				break;
		}
	}

	private resolveWorkerPath(): string {
		// __dirname: dist/modules/analytics/workers (prod) hoặc src/... (dev ts-node)
		const isTs = __filename.endsWith('.ts');
		return path.join(
			__dirname,
			isTs ? 'export-worker.ts' : 'export-worker.js',
		);
	}

	private resolveExecArgv(): string[] {
		// Dev (chạy .ts) cần ts-node + tsconfig-paths để resolve alias `src/...`.
		if (__filename.endsWith('.ts')) {
			return ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register'];
		}
		return [];
	}

	private isTerminalStatus(status: ImportJobStatus): boolean {
		return (
			status === ImportJobStatus.COMPLETED ||
			status === ImportJobStatus.FAILED ||
			status === ImportJobStatus.CANCELLED
		);
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((r) => setTimeout(r, ms));
	}
}
