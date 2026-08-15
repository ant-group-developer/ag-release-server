import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';
import { Subscription } from 'rxjs';
import { BucketR2Service } from 'src/modules/bucket2/services/bucket-r2.service';
import { ImportJobStatus } from 'src/modules/etl/interfaces';
import { ImportJobsService } from 'src/modules/etl/services/import-jobs/import-jobs.service';
import { JobEventsGateway } from 'src/modules/etl/services/import-jobs/job-events.gateway';
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
	private static readonly MAX_MISSING_ROW_ATTEMPTS = 5;
	private activeCount = 0;
	private isRunning = false;
	private readonly running = new Map<string, RunningJob>();
	private cancelSub?: Subscription;

	constructor(
		private readonly importJobsService: ImportJobsService,
		private readonly exportQueueService: ExportQueueService,
		private readonly jobEvents: JobEventsGateway,
		private readonly r2Service: BucketR2Service,
	) {}

	private resolveMaxThreads(): number {
		const fromEnv = Number(process.env.EXPORT_WORKER_THREADS);
		if (Number.isFinite(fromEnv) && fromEnv >= 1)
			return Math.floor(fromEnv);
		// Mặc định: chừa 1 core cho event loop HTTP.
		return Math.max(1, (os.cpus()?.length ?? 2) - 1);
	}

	async onModuleInit() {
		// Chỉ container APP_ROLE=worker được chạy pool. Trước đây thiếu gate này
		// nên cả container `api` lẫn `worker` cùng RPOPLPUSH trên queue → container
		// nào thắng là random, và mọi state/event của job nằm in-memory ở container
		// đó → SSE ở container kia treo vĩnh viễn.
		if (process.env.APP_ROLE !== 'worker') {
			this.logger.log(
				`Export worker pool disabled on role=${process.env.APP_ROLE || 'api'}`,
			);
			return;
		}

		await this.exportQueueService.redeliverStuck();

		// Cancel đến từ HTTP handler ở container `api` → nhận qua Redis pub/sub.
		this.cancelSub = this.jobEvents.onCancelRequest().subscribe((jobId) => {
			if (this.running.has(jobId)) {
				this.logger.log(`Cancel request received for job ${jobId}`);
				this.requestCancel(jobId);
			}
		});

		this.isRunning = true;
		this.logger.log(
			`Export worker pool started with ${this.maxThreads} thread(s)`,
		);
		void this.pollLoop();
	}

	async onModuleDestroy() {
		this.isRunning = false;
		this.cancelSub?.unsubscribe();
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
		// Khi row chưa visible qua FINAL, ta nack để retry → KHÔNG được ack ở finally
		// (ack sẽ xoá job khỏi processing set mà nack vừa đẩy lại vào queue).
		let requeued = false;

		try {
			const job = await this.importJobsService.findById(jobId);

			if (!job) {
				requeued = await this.requeueForMissingRow(jobId);
				return;
			}

			if (this.isTerminalStatus(job.status)) {
				this.logger.log(
					`Job ${jobId} already ${job.status}. Acking without run.`,
				);
				return;
			}

			await this.exportQueueService.clearMissingRowAttempts(jobId);
			// Nếu job được reaper cứu trước đó thì đã chạy trở lại bình thường;
			// không giữ retry history cũ cho lần orphan sau.
			await this.exportQueueService.clearRequeueAttempts(jobId);
			await this.importJobsService.markProcessing(jobId);
			await this.spawnAndWait(
				jobId,
				job.tenantId || '',
				job.params as unknown as AnalyticsReportExportDto,
			);
		} catch (err: any) {
			this.logger.error(`Job ${jobId} failed: ${err.message}`, err.stack);
			// markFailed giờ await persist và không swallow lỗi → phải catch ở đây,
			// nếu không sẽ thành unhandled rejection (runJob được gọi bằng `void`).
			await this.importJobsService
				.markFailed(jobId, err instanceof Error ? err : String(err))
				.catch((markErr) => {
					this.logger.error(
						`Failed to mark job ${jobId} as FAILED: ${markErr.message}`,
					);
				});
		} finally {
			if (!requeued) {
				await this.exportQueueService.ack(jobId).catch(() => undefined);
			}
			this.running.delete(jobId);
			this.activeCount--;
		}
	}

	/**
	 * Worker dequeue được jobId nhưng `findById` trả null — thường là race
	 * ReplacingMergeTree ngay sau create. Trước đây chỗ này ack im lặng → job biến
	 * mất khỏi queue, đứng QUEUED vĩnh viễn, không log gì.
	 *
	 * Trả về true nếu đã nack (caller không được ack nữa).
	 */
	private async requeueForMissingRow(jobId: string): Promise<boolean> {
		const attempts = await this.exportQueueService
			.incrementMissingRowAttempt(jobId)
			.catch(() => Number.MAX_SAFE_INTEGER);

		if (attempts > ExportWorkerPoolService.MAX_MISSING_ROW_ATTEMPTS) {
			this.logger.error(
				`Job ${jobId} not found in ClickHouse after ${attempts} attempt(s). Giving up.`,
			);
			await this.exportQueueService
				.clearMissingRowAttempts(jobId)
				.catch(() => undefined);
			await this.importJobsService
				.markFailed(jobId, 'Job row not found in ClickHouse')
				.catch(() => undefined);
			return false;
		}

		// Backoff tuyến tính: 1s, 2s, 3s... trước khi đẩy lại vào queue.
		const backoffMs = attempts * 1000;
		this.logger.warn(
			`Job ${jobId} row not visible yet (attempt ${attempts}). Requeue in ${backoffMs}ms.`,
		);
		await this.sleep(backoffMs);
		await this.exportQueueService.nack(jobId).catch(() => undefined);
		return true;
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
			case 'done': {
				// Job có thể đã bị cancel TRONG LÚC worker đang zip/upload. Khi đó
				// markCompleted() bị skip (giữ nguyên CANCELLED) → file vừa upload
				// nằm lại R2 vĩnh viễn vì cleanup cron chỉ quét job COMPLETED.
				const current = await this.importJobsService
					.findById(jobId)
					.catch(() => null);

				if (current?.status === ImportJobStatus.CANCELLED) {
					await this.discardOrphanExportFile(jobId, msg.result?.key);
					done(resolve);
					break;
				}

				await this.importJobsService
					.markCompleted(jobId, {
						...msg.result,
						totalProcessedRows: msg.result?.totalRows,
					})
					.catch(() => undefined);
				done(resolve);
				break;
			}
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

	/** Xoá file đã upload của job bị cancel giữa chừng (tránh rác trên R2). */
	private async discardOrphanExportFile(
		jobId: string,
		key?: unknown,
	): Promise<void> {
		if (typeof key !== 'string' || !key) {
			this.logger.warn(
				`Job ${jobId} cancelled after upload but result.key missing — cannot clean R2`,
			);
			return;
		}

		try {
			await this.r2Service.deletePrivate(key);
			this.logger.log(
				`Discarded orphan export file for cancelled job ${jobId}: ${key}`,
			);
		} catch (err) {
			this.logger.warn(
				`Failed to discard orphan export file ${key} for job ${jobId}: ${err instanceof Error ? err.message : String(err)}`,
			);
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
