import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
	OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { v4 as uuidv4 } from 'uuid';
import { Repository } from 'typeorm';
import { MetadataScanSchedule } from 'src/modules/release/entities/metadata-scan-schedule.entity';
import {
	MetadataScanSession,
	MetadataScanTriggerType,
	ScanSessionStatus,
} from 'src/modules/release/entities/metadata-scan-session.entity';
import {
	CreateMetadataScanScheduleDto,
	UpdateMetadataScanScheduleDto,
} from '../dtos/metadata-scan-schedule.dto';
import { MetadataScanService } from './metadata-scan.service';

@Injectable()
export class MetadataScanScheduleService implements OnModuleInit {
	private readonly logger = new Logger(MetadataScanScheduleService.name);
	private readonly jobNamePrefix = 'metadata-scan-schedule';

	constructor(
		@InjectRepository(MetadataScanSchedule)
		private readonly scheduleRepo: Repository<MetadataScanSchedule>,

		@InjectRepository(MetadataScanSession)
		private readonly sessionRepo: Repository<MetadataScanSession>,

		private readonly schedulerRegistry: SchedulerRegistry,
		private readonly metadataScanService: MetadataScanService,
	) {}

	async onModuleInit(): Promise<void> {
		await this.reloadSchedules();
	}

	async list(): Promise<MetadataScanSchedule[]> {
		return this.scheduleRepo.find({
			where: { isDeleted: false },
			order: { createdAt: 'DESC' },
		});
	}

	async create(
		dto: CreateMetadataScanScheduleDto,
	): Promise<MetadataScanSchedule> {
		this.assertLimit(dto.limitCount);
		const schedule = this.scheduleRepo.create({
			name: dto.name,
			enabled: dto.enabled ?? true,
			cronExpression: dto.cronExpression,
			timezone: dto.timezone || 'Asia/Ho_Chi_Minh',
			isImportedFromReport: dto.isImportedFromReport,
			limitCount: dto.limitCount === undefined ? 500 : dto.limitCount,
			force: dto.force ?? false,
			isDeleted: false,
		});

		this.assertCron(schedule);
		const saved = await this.scheduleRepo.save(schedule);
		this.registerSchedule(saved);
		return saved;
	}

	async update(
		id: string,
		dto: UpdateMetadataScanScheduleDto,
	): Promise<MetadataScanSchedule> {
		const schedule = await this.findActiveById(id);

		Object.assign(schedule, {
			...(dto.name !== undefined ? { name: dto.name } : {}),
			...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
			...(dto.cronExpression !== undefined
				? { cronExpression: dto.cronExpression }
				: {}),
			...(dto.timezone !== undefined
				? { timezone: dto.timezone || 'Asia/Ho_Chi_Minh' }
				: {}),
			...(dto.isImportedFromReport !== undefined
				? { isImportedFromReport: dto.isImportedFromReport }
				: {}),
			...(dto.limitCount !== undefined ? { limitCount: dto.limitCount } : {}),
			...(dto.force !== undefined ? { force: dto.force } : {}),
		});

		this.assertLimit(schedule.limitCount);
		this.assertCron(schedule);

		const saved = await this.scheduleRepo.save(schedule);
		this.registerSchedule(saved);
		return saved;
	}

	async remove(id: string): Promise<void> {
		const schedule = await this.findActiveById(id);
		schedule.isDeleted = true;
		schedule.enabled = false;
		await this.scheduleRepo.save(schedule);
		this.deleteJobIfExists(id);
	}

	async runNow(id: string): Promise<{
		scanId?: string;
		skipped: boolean;
		reason?: string;
	}> {
		const schedule = await this.findActiveById(id);
		return this.startScheduleRun(schedule);
	}

	async reloadSchedules(): Promise<void> {
		for (const [jobName] of this.schedulerRegistry.getCronJobs()) {
			if (jobName.startsWith(`${this.jobNamePrefix}:`)) {
				this.schedulerRegistry.deleteCronJob(jobName);
			}
		}

		const schedules = await this.scheduleRepo.find({
			where: { enabled: true, isDeleted: false },
		});

		for (const schedule of schedules) {
			this.registerSchedule(schedule);
		}
	}

	private registerSchedule(schedule: MetadataScanSchedule): void {
		this.deleteJobIfExists(schedule.id);

		if (!schedule.enabled || schedule.isDeleted) {
			this.logger.log(`Schedule ${schedule.id} is disabled`);
			return;
		}

		try {
			const job = new CronJob(
				schedule.cronExpression,
				() => {
					this.startScheduleRun(schedule).catch((err) => {
						this.logger.error(
							`Schedule ${schedule.id} failed to start: ${err.message}`,
							err.stack,
						);
					});
				},
				null,
				false,
				schedule.timezone || 'Asia/Ho_Chi_Minh',
			);

			this.schedulerRegistry.addCronJob(this.getJobName(schedule.id), job);
			job.start();
			this.logger.log(
				`Registered metadata scan schedule ${schedule.id}: ${schedule.cronExpression}`,
			);
		} catch (err) {
			this.logger.error(
				`Failed to register metadata scan schedule ${schedule.id}: ${(err as Error).message}`,
			);
		}
	}

	private async startScheduleRun(schedule: MetadataScanSchedule): Promise<{
		scanId?: string;
		skipped: boolean;
		reason?: string;
	}> {
		const processingSession = await this.sessionRepo.findOne({
			where: {
				scheduleId: schedule.id,
				status: ScanSessionStatus.PROCESSING,
			},
		});

		if (processingSession) {
			const reason = `Schedule already has processing scan ${processingSession.id}`;
			await this.scheduleRepo.update(schedule.id, {
				lastSkippedAt: new Date(),
				lastSkipReason: reason,
			});
			this.logger.warn(`Skipped metadata scan schedule ${schedule.id}: ${reason}`);
			return { skipped: true, reason };
		}

		const scanId = uuidv4();
		await this.scheduleRepo.update(schedule.id, {
			lastRunAt: new Date(),
			lastScanId: scanId,
			lastSkippedAt: null,
			lastSkipReason: null,
			lastError: null,
		});

		this.metadataScanService
			.scanAndEnrichAll({
				scanId,
				force: schedule.force,
				limit: schedule.limitCount ?? undefined,
				isImportedFromReport: schedule.isImportedFromReport,
				triggerType: MetadataScanTriggerType.CRON,
				scheduleId: schedule.id,
			})
			.catch(async (err) => {
				await this.scheduleRepo.update(schedule.id, {
					lastError: err.message,
				});
				this.logger.error(
					`Metadata scan schedule ${schedule.id} failed: ${err.message}`,
					err.stack,
				);
			});

		return { scanId, skipped: false };
	}

	private async findActiveById(id: string): Promise<MetadataScanSchedule> {
		const schedule = await this.scheduleRepo.findOne({
			where: { id, isDeleted: false },
		});
		if (!schedule) {
			throw new NotFoundException(`Metadata scan schedule not found: ${id}`);
		}
		return schedule;
	}

	private deleteJobIfExists(scheduleId: string): void {
		const jobName = this.getJobName(scheduleId);
		const jobs = this.schedulerRegistry.getCronJobs();
		if (jobs.has(jobName)) {
			this.schedulerRegistry.deleteCronJob(jobName);
			this.logger.log(`Deleted metadata scan cron job: ${jobName}`);
		}
	}

	private getJobName(scheduleId: string): string {
		return `${this.jobNamePrefix}:${scheduleId}`;
	}

	private assertCron(schedule: Pick<MetadataScanSchedule, 'cronExpression' | 'timezone'>): void {
		try {
			new CronJob(
				schedule.cronExpression,
				() => undefined,
				null,
				false,
				schedule.timezone || 'Asia/Ho_Chi_Minh',
			);
		} catch (err) {
			throw new BadRequestException(
				`Invalid cron schedule: ${(err as Error).message}`,
			);
		}
	}

	private assertLimit(limitCount: number | null | undefined): void {
		if (limitCount !== null && limitCount !== undefined && limitCount < 1) {
			throw new BadRequestException('limitCount must be greater than 0 or null');
		}
	}
}
