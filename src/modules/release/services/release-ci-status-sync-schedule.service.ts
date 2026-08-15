import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
	OnModuleInit,
} from '@nestjs/common';
import { Interval, SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { UpdateReleaseCiStatusSyncScheduleDto } from '../dto/release-ci-status-sync-schedule.dto';
import { ReleaseCiStatusSyncSchedule } from '../entities/release-ci-status-sync-schedule.entity';
import { Release } from '../entities/release.entity';
import { ReleaseDspDeliveryService } from './release-dsp-services/release-dsp-delivery.service';

type SyncTrigger = 'cron' | 'manual' | 'restart';

type ClaimedSchedule = Pick<
	ReleaseCiStatusSyncSchedule,
	'id' | 'releaseStatuses' | 'batchSize' | 'concurrency' | 'runningSince'
>;

export interface ReleaseCiStatusSyncSummary {
	scheduleId: string;
	trigger: SyncTrigger;
	total: number;
	succeeded: number;
	failed: number;
	durationMs: number;
	stoppedBecauseDisabled: boolean;
}

export interface ReleaseCiStatusSyncRestartRequested {
	scheduleId: string;
	restartRequested: true;
	restartRequestedAt: Date;
	runningSince: Date | null;
}

@Injectable()
export class ReleaseCiStatusSyncScheduleService implements OnModuleInit {
	private readonly logger = new Logger(
		ReleaseCiStatusSyncScheduleService.name,
	);
	private readonly jobNamePrefix = 'release-ci-status-sync';
	private loadedScheduleUpdatedAt: number | null = null;

	constructor(
		@InjectRepository(ReleaseCiStatusSyncSchedule)
		private readonly scheduleRepo: Repository<ReleaseCiStatusSyncSchedule>,

		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		private readonly schedulerRegistry: SchedulerRegistry,
		private readonly releaseDspDeliveryService: ReleaseDspDeliveryService,
	) {}

	onModuleInit(): void {
		if (!this.isWorker()) {
			this.logger.debug(
				'Skipping CI status sync schedule registration (not worker role)',
			);
			return;
		}

		void this.reloadSchedule().catch((err: Error) => {
			this.logger.error(
				`[CI_STATUS_SYNC] Failed to load schedule: ${err.message}`,
				err.stack,
			);
		});
	}

	async getConfig(): Promise<ReleaseCiStatusSyncSchedule> {
		const schedule = await this.findSchedule();
		if (!schedule) {
			throw new NotFoundException(
				'Release CI status sync schedule is not configured',
			);
		}
		return schedule;
	}

	async updateConfig(
		dto: UpdateReleaseCiStatusSyncScheduleDto,
	): Promise<ReleaseCiStatusSyncSchedule> {
		const schedule = await this.getConfig();

		Object.assign(schedule, {
			...(dto.syncStatusEnabled !== undefined
				? { syncStatusEnabled: dto.syncStatusEnabled }
				: {}),
			...(dto.cronExpression !== undefined
				? { cronExpression: dto.cronExpression }
				: {}),
			...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
			...(dto.releaseStatuses !== undefined
				? { releaseStatuses: dto.releaseStatuses }
				: {}),
			...(dto.batchSize !== undefined
				? { batchSize: dto.batchSize }
				: {}),
			...(dto.concurrency !== undefined
				? { concurrency: dto.concurrency }
				: {}),
		});

		this.assertSchedule(schedule);
		const saved = await this.scheduleRepo.save(schedule);

		if (this.isWorker()) {
			this.registerSchedule(saved);
		}

		return saved;
	}

	async runNow(): Promise<
		ReleaseCiStatusSyncSummary | ReleaseCiStatusSyncRestartRequested
	> {
		return this.execute('manual');
	}

	async reloadSchedule(): Promise<void> {
		this.deleteRegisteredJobs();

		const schedule = await this.findSchedule();
		if (!schedule) {
			this.loadedScheduleUpdatedAt = null;
			this.logger.warn('[CI_STATUS_SYNC] Schedule config was not found');
			return;
		}

		this.registerSchedule(schedule);
	}

	@Interval(60_000)
	async reconcileSchedule(): Promise<void> {
		if (!this.isWorker()) return;

		try {
			const schedule = await this.findSchedule();
			const updatedAt = schedule?.updatedAt?.getTime() ?? null;

			if (updatedAt !== this.loadedScheduleUpdatedAt) {
				await this.reloadSchedule();
			}
		} catch (err) {
			this.logger.error(
				`[CI_STATUS_SYNC] Failed to reconcile schedule: ${(err as Error).message}`,
				(err as Error).stack,
			);
		}
	}

	private registerSchedule(schedule: ReleaseCiStatusSyncSchedule): void {
		this.deleteJobIfExists(schedule.id);
		this.loadedScheduleUpdatedAt = schedule.updatedAt?.getTime() ?? null;

		if (!schedule.syncStatusEnabled) {
			this.logger.log('[CI_STATUS_SYNC] Schedule is disabled');
			return;
		}

		this.assertSchedule(schedule);

		const job = new CronJob(
			schedule.cronExpression,
			() => {
				void this.execute('cron').catch((err: Error) => {
					this.logger.error(
						`[CI_STATUS_SYNC] Cron execution failed: ${err.message}`,
						err.stack,
					);
				});
			},
			null,
			false,
			schedule.timezone,
		);

		this.schedulerRegistry.addCronJob(this.getJobName(schedule.id), job);
		job.start();
		this.logger.log(
			`[CI_STATUS_SYNC] Registered schedule=${schedule.id} cron="${schedule.cronExpression}" timezone=${schedule.timezone}`,
		);
	}

	private async execute(
		trigger: SyncTrigger,
	): Promise<
		ReleaseCiStatusSyncSummary | ReleaseCiStatusSyncRestartRequested
	> {
		const schedule = await this.getConfig();
		const runToken = uuidv4();
		const claimed = await this.tryClaimRun(schedule.id, runToken);

		if (!claimed) {
			const current = await this.getConfig();
			const reason = current.syncStatusEnabled
				? 'ALREADY_RUNNING'
				: 'DISABLED';
			this.logger.warn(
				`[CI_STATUS_SYNC] SKIPPED trigger=${trigger} reason=${reason} runningSince=${current.runningSince?.toISOString() ?? 'null'}`,
			);

			if (trigger === 'manual') {
				if (!current.syncStatusEnabled) {
					throw new BadRequestException(
						'Release CI status synchronization is disabled',
					);
				}

				const restartRequestedAt = new Date();
				const updateResult = await this.scheduleRepo.update(
					{ id: current.id, isRunning: true },
					{ restartRequestedAt },
				);

				if (!updateResult.affected) {
					return this.execute('manual');
				}

				this.logger.warn(
					`[CI_STATUS_SYNC] RESTART_REQUESTED runningSince=${current.runningSince?.toISOString() ?? 'null'} requestedAt=${restartRequestedAt.toISOString()}`,
				);

				return {
					scheduleId: current.id,
					restartRequested: true,
					restartRequestedAt,
					runningSince: current.runningSince,
				};
			}

			return {
				scheduleId: schedule.id,
				trigger,
				total: 0,
				succeeded: 0,
				failed: 0,
				durationMs: 0,
				stoppedBecauseDisabled: !current.syncStatusEnabled,
			};
		}

		const startedAt = Date.now();
		let total = 0;
		let succeeded = 0;
		let failed = 0;
		let lastId: string | null = null;
		let stoppedBecauseDisabled = false;
		let restartRequested = false;

		try {
			this.logger.log(
				`[CI_STATUS_SYNC] START trigger=${trigger} scheduleId=${claimed.id} statuses=${claimed.releaseStatuses.join(',')}`,
			);

			batchLoop: while (true) {
				if (!(await this.isSyncEnabled(claimed.id))) {
					stoppedBecauseDisabled = true;
					this.logger.warn(
						'[CI_STATUS_SYNC] STOPPED reason=DISABLED_DURING_RUN',
					);
					break;
				}

				const releaseIds = await this.findNextReleaseIds({
					statuses: claimed.releaseStatuses,
					batchSize: claimed.batchSize,
					lastId,
				});

				if (!releaseIds.length) break;

				for (
					let offset = 0;
					offset < releaseIds.length;
					offset += claimed.concurrency
				) {
					const chunk = releaseIds.slice(
						offset,
						offset + claimed.concurrency,
					);
					const results = await Promise.allSettled(
						chunk.map((releaseId) =>
							this.syncOneRelease(releaseId),
						),
					);

					total += results.length;
					succeeded += results.filter(
						(result) => result.status === 'fulfilled',
					).length;
					failed += results.filter(
						(result) => result.status === 'rejected',
					).length;

					if (await this.hasRestartRequest(claimed.id)) {
						restartRequested = true;
						this.logger.warn(
							'[CI_STATUS_SYNC] STOPPED reason=RESTART_REQUESTED',
						);
						break batchLoop;
					}
				}

				lastId = releaseIds[releaseIds.length - 1];
			}

			const durationMs = Date.now() - startedAt;
			this.logger.log(
				`[CI_STATUS_SYNC] COMPLETE trigger=${trigger} total=${total} succeeded=${succeeded} failed=${failed} durationMs=${durationMs}`,
			);

			return {
				scheduleId: claimed.id,
				trigger,
				total,
				succeeded,
				failed,
				durationMs,
				stoppedBecauseDisabled,
			};
		} finally {
			if (!restartRequested) {
				try {
					restartRequested = await this.hasRestartRequest(claimed.id);
				} catch (err) {
					this.logger.error(
						`[CI_STATUS_SYNC] Failed to check restart request: ${(err as Error).message}`,
					);
				}
			}
			await this.releaseRun(claimed.id, runToken);

			if (restartRequested) {
				void this.execute('restart').catch((err: Error) => {
					this.logger.error(
						`[CI_STATUS_SYNC] Restart execution failed: ${err.message}`,
						err.stack,
					);
				});
			}
		}
	}

	private async syncOneRelease(releaseId: string): Promise<void> {
		const startedAt = Date.now();
		this.logger.log(
			`[CI_STATUS_SYNC] RELEASE_START releaseId=${releaseId}`,
		);

		try {
			const result =
				await this.releaseDspDeliveryService.syncStatusFromCi(
					releaseId,
				);
			this.logger.log(
				`[CI_STATUS_SYNC] RELEASE_SUCCESS releaseId=${releaseId} applied=${result.applied ?? 0} skipped=${result.skipped ?? 0} releaseStatus=${result.releaseStatus ?? 'unknown'} durationMs=${Date.now() - startedAt}`,
			);
		} catch (err) {
			this.logger.error(
				`[CI_STATUS_SYNC] RELEASE_FAILED releaseId=${releaseId} error="${(err as Error).message}" durationMs=${Date.now() - startedAt}`,
				(err as Error).stack,
			);
			throw err;
		}
	}

	private async tryClaimRun(
		scheduleId: string,
		runToken: string,
	): Promise<ClaimedSchedule | null> {
		const queryResult: unknown = await this.scheduleRepo.query(
			`
				UPDATE "release_ci_status_sync_schedules"
				SET
					"is_running" = true,
					"running_since" = NOW(),
					"running_by" = $2,
					"last_run_at" = NOW(),
					"restart_requested_at" = NULL
				WHERE "id" = $1
					AND "sync_status_enabled" = true
					AND (
						"is_running" = false
						OR "running_since" IS NULL
						OR "running_since" < NOW() - INTERVAL '1 hour'
					)
				RETURNING
					"id",
					"release_statuses" AS "releaseStatuses",
					"batch_size" AS "batchSize",
					"concurrency",
					"running_since" AS "runningSince"
			`,
			[scheduleId, runToken],
		);

		if (!Array.isArray(queryResult)) return null;

		const rows = Array.isArray(queryResult[0])
			? queryResult[0]
			: queryResult;
		return (rows[0] as ClaimedSchedule | undefined) ?? null;
	}

	private async releaseRun(
		scheduleId: string,
		runToken: string,
	): Promise<void> {
		await this.scheduleRepo.query(
			`
				UPDATE "release_ci_status_sync_schedules"
				SET
					"is_running" = false,
					"running_since" = NULL,
					"running_by" = NULL,
					"last_finished_at" = NOW()
				WHERE "id" = $1
					AND "running_by" = $2
			`,
			[scheduleId, runToken],
		);
	}

	private async isSyncEnabled(scheduleId: string): Promise<boolean> {
		const schedule = await this.scheduleRepo.findOne({
			where: { id: scheduleId },
			select: ['id', 'syncStatusEnabled'],
		});
		return schedule?.syncStatusEnabled ?? false;
	}

	private async hasRestartRequest(scheduleId: string): Promise<boolean> {
		const schedule = await this.scheduleRepo.findOne({
			where: { id: scheduleId },
			select: ['id', 'restartRequestedAt'],
		});
		return schedule?.restartRequestedAt != null;
	}

	private async findNextReleaseIds(input: {
		statuses: ClaimedSchedule['releaseStatuses'];
		batchSize: number;
		lastId: string | null;
	}): Promise<string[]> {
		const query = this.releaseRepo
			.createQueryBuilder('release')
			.select('release.id', 'id')
			.where('release.status IN (:...statuses)', {
				statuses: input.statuses,
			})
			.andWhere('release.type = :releaseType', { releaseType: 'audio' })
			.orderBy('release.id', 'ASC')
			.limit(input.batchSize);

		if (input.lastId) {
			query.andWhere('release.id > :lastId', { lastId: input.lastId });
		}

		const rows = await query.getRawMany<{ id: string }>();
		return rows.map((row) => row.id);
	}

	private assertSchedule(
		schedule: Pick<
			ReleaseCiStatusSyncSchedule,
			| 'cronExpression'
			| 'timezone'
			| 'releaseStatuses'
			| 'batchSize'
			| 'concurrency'
		>,
	): void {
		if (!schedule.releaseStatuses.length) {
			throw new BadRequestException('releaseStatuses must not be empty');
		}
		if (schedule.batchSize < 1 || schedule.batchSize > 500) {
			throw new BadRequestException(
				'batchSize must be between 1 and 500',
			);
		}
		if (schedule.concurrency < 1 || schedule.concurrency > 10) {
			throw new BadRequestException(
				'concurrency must be between 1 and 10',
			);
		}

		try {
			new CronJob(
				schedule.cronExpression,
				() => undefined,
				null,
				false,
				schedule.timezone,
			);
		} catch (err) {
			throw new BadRequestException(
				`Invalid cron schedule: ${(err as Error).message}`,
			);
		}
	}

	private async findSchedule(): Promise<ReleaseCiStatusSyncSchedule | null> {
		const [schedule] = await this.scheduleRepo.find({
			order: { createdAt: 'ASC' },
			take: 1,
		});

		return schedule ?? null;
	}

	private deleteRegisteredJobs(): void {
		for (const [jobName] of this.schedulerRegistry.getCronJobs()) {
			if (jobName.startsWith(`${this.jobNamePrefix}:`)) {
				this.schedulerRegistry.deleteCronJob(jobName);
			}
		}
	}

	private deleteJobIfExists(scheduleId: string): void {
		const jobName = this.getJobName(scheduleId);
		if (this.schedulerRegistry.getCronJobs().has(jobName)) {
			this.schedulerRegistry.deleteCronJob(jobName);
		}
	}

	private getJobName(scheduleId: string): string {
		return `${this.jobNamePrefix}:${scheduleId}`;
	}

	private isWorker(): boolean {
		return process.env.APP_ROLE === 'worker';
	}
}
