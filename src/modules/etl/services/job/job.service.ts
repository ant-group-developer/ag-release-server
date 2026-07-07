import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export type JobStatus = 'pending' | 'running' | 'done' | 'error';

export interface SyncJob {
	id: string;
	type: 'sync' | 'sync-all' | 'retry';
	status: JobStatus;
	params: Record<string, unknown>;
	progress: {
		current: number;
		total: number;
		currentItem?: string;
	};
	result?: any;
	error?: string;
	createdAt: Date;
	startedAt?: Date;
	completedAt?: Date;
}

@Injectable()
export class JobService {
	private readonly logger = new Logger(JobService.name);
	private readonly jobs = new Map<string, SyncJob>();

	/**
	 * Create a new job and return its ID immediately.
	 * The actual work is executed asynchronously via the callback.
	 */
	createJob(
		type: SyncJob['type'],
		params: Record<string, unknown>,
		executor: (
			job: SyncJob,
			updateProgress: (
				current: number,
				total: number,
				currentItem?: string,
			) => void,
		) => Promise<any>,
	): string {
		const job: SyncJob = {
			id: uuidv4(),
			type,
			status: 'pending',
			params,
			progress: { current: 0, total: 0 },
			createdAt: new Date(),
		};

		this.jobs.set(job.id, job);
		this.logger.log(`Job ${job.id} created (${type})`);

		// Execute asynchronously — don't await
		setImmediate(async () => {
			job.status = 'running';
			job.startedAt = new Date();

			try {
				const updateProgress = (
					current: number,
					total: number,
					currentItem?: string,
				) => {
					job.progress = { current, total, currentItem };
				};

				job.result = await executor(job, updateProgress);
				job.status = 'done';
				this.logger.log(`Job ${job.id} completed`);
			} catch (err) {
				job.status = 'error';
				job.error = err.message;
				this.logger.error(`Job ${job.id} failed: ${err.message}`);
			} finally {
				job.completedAt = new Date();
			}
		});

		return job.id;
	}

	getJob(id: string): SyncJob | null {
		return this.jobs.get(id) || null;
	}

	getAllJobs(): SyncJob[] {
		return Array.from(this.jobs.values())
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
			.slice(0, 50); // Keep last 50
	}

	/**
	 * Cleanup old completed jobs (keep last 100).
	 */
	cleanup(): void {
		const sorted = Array.from(this.jobs.entries()).sort(
			(a, b) => b[1].createdAt.getTime() - a[1].createdAt.getTime(),
		);

		if (sorted.length > 100) {
			for (const [id] of sorted.slice(100)) {
				this.jobs.delete(id);
			}
		}
	}
}
