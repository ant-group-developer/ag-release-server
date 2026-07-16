import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
	OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CreateSonarScheduleDto, UpdateSonarScheduleDto } from '../dtos/spotify-sonar-schedule.dto';
import { SpotifySonarScanSchedule } from '../entities/spotify-sonar-scan-schedule.entity';
import { SpotifyProviderScanService } from './spotify-provider-scan.service';

export { CreateSonarScheduleDto, UpdateSonarScheduleDto };

@Injectable()
export class SpotifySonarScheduleService implements OnModuleInit {
	private readonly logger = new Logger(SpotifySonarScheduleService.name);
	private readonly jobNamePrefix = 'spotify-sonar-schedule';

	constructor(
		@InjectRepository(SpotifySonarScanSchedule)
		private readonly scheduleRepo: Repository<SpotifySonarScanSchedule>,

		private readonly schedulerRegistry: SchedulerRegistry,
		private readonly scanService: SpotifyProviderScanService,
	) {}

	onModuleInit(): void {
		if (process.env.APP_ROLE !== 'worker') {
			this.logger.debug('Skipping Spotify Sonar scan schedules (not worker role)');
			return;
		}
		this.reloadSchedules().catch((err: Error) => {
			this.logger.error(`Failed to load Spotify Sonar scan schedules: ${err.message}`);
		});
	}

	async list(): Promise<SpotifySonarScanSchedule[]> {
		return this.scheduleRepo.find({
			where: { isDeleted: false },
			order: { createdAt: 'DESC' },
		});
	}

	async create(dto: CreateSonarScheduleDto): Promise<SpotifySonarScanSchedule> {
		this.assertLimit(dto.limitCount);
		const schedule = this.scheduleRepo.create({
			name: dto.name,
			enabled: dto.enabled ?? true,
			cronExpression: dto.cronExpression,
			timezone: dto.timezone || 'Asia/Ho_Chi_Minh',
			isImportedFromReport: dto.isImportedFromReport ?? null,
			limitCount: dto.limitCount === undefined ? 500 : dto.limitCount,
			force: dto.force ?? false,
			isDeleted: false,
		});
		this.assertCron(schedule);
		const saved = await this.scheduleRepo.save(schedule);
		this.registerSchedule(saved);
		return saved;
	}

	async update(id: string, dto: UpdateSonarScheduleDto): Promise<SpotifySonarScanSchedule> {
		const schedule = await this.findActiveById(id);

		Object.assign(schedule, {
			...(dto.name !== undefined ? { name: dto.name } : {}),
			...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
			...(dto.cronExpression !== undefined ? { cronExpression: dto.cronExpression } : {}),
			...(dto.timezone !== undefined ? { timezone: dto.timezone || 'Asia/Ho_Chi_Minh' } : {}),
			...(dto.isImportedFromReport !== undefined ? { isImportedFromReport: dto.isImportedFromReport } : {}),
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

	async runNow(id: string): Promise<{ scanId?: string; skipped: boolean; reason?: string }> {
		const schedule = await this.findActiveById(id);
		return this.startScheduleRun(schedule);
	}

	async reloadSchedules(): Promise<void> {
		for (const [jobName] of this.schedulerRegistry.getCronJobs()) {
			if (jobName.startsWith(`${this.jobNamePrefix}:`)) {
				this.schedulerRegistry.deleteCronJob(jobName);
			}
		}
		const schedules = await this.scheduleRepo.find({ where: { enabled: true, isDeleted: false } });
		for (const schedule of schedules) {
			this.registerSchedule(schedule);
		}
	}

	private registerSchedule(schedule: SpotifySonarScanSchedule): void {
		this.deleteJobIfExists(schedule.id);

		if (!schedule.enabled || schedule.isDeleted) {
			this.logger.log(`Schedule ${schedule.id} is disabled`);
			return;
		}

		try {
			const job = new CronJob(
				schedule.cronExpression,
				() => {
					this.startScheduleRun(schedule).catch((err: Error) => {
						this.logger.error(`Schedule ${schedule.id} failed to start: ${err.message}`, err.stack);
					});
				},
				null,
				false,
				schedule.timezone || 'Asia/Ho_Chi_Minh',
			);

			this.schedulerRegistry.addCronJob(this.getJobName(schedule.id), job);
			job.start();
			this.logger.log(`Registered Spotify Sonar schedule ${schedule.id}: ${schedule.cronExpression}`);
		} catch (err) {
			this.logger.error(`Failed to register schedule ${schedule.id}: ${(err as Error).message}`);
		}
	}

	private async startScheduleRun(
		schedule: SpotifySonarScanSchedule,
	): Promise<{ scanId?: string; skipped: boolean; reason?: string }> {
		const scanId = uuidv4();

		await this.scheduleRepo.update(schedule.id, {
			lastRunAt: new Date(),
			lastScanId: scanId,
			lastSkippedAt: null,
			lastSkipReason: null,
			lastError: null,
		});

		this.scanService
			.scanAll({
				limit: schedule.limitCount ?? undefined,
				isImportedFromReport: schedule.isImportedFromReport ?? undefined,
				force: schedule.force,
			})
			.catch(async (err: Error) => {
				await this.scheduleRepo.update(schedule.id, { lastError: err.message });
				this.logger.error(`Spotify Sonar schedule ${schedule.id} failed: ${err.message}`, err.stack);
			});

		return { scanId, skipped: false };
	}

	private async findActiveById(id: string): Promise<SpotifySonarScanSchedule> {
		const schedule = await this.scheduleRepo.findOne({ where: { id, isDeleted: false } });
		if (!schedule) throw new NotFoundException(`Spotify Sonar scan schedule not found: ${id}`);
		return schedule;
	}

	private deleteJobIfExists(scheduleId: string): void {
		const jobName = this.getJobName(scheduleId);
		const jobs = this.schedulerRegistry.getCronJobs();
		if (jobs.has(jobName)) {
			this.schedulerRegistry.deleteCronJob(jobName);
		}
	}

	private getJobName(scheduleId: string): string {
		return `${this.jobNamePrefix}:${scheduleId}`;
	}

	private assertCron(schedule: Pick<SpotifySonarScanSchedule, 'cronExpression' | 'timezone'>): void {
		try {
			new CronJob(schedule.cronExpression, () => undefined, null, false, schedule.timezone || 'Asia/Ho_Chi_Minh');
		} catch (err) {
			throw new BadRequestException(`Invalid cron expression: ${(err as Error).message}`);
		}
	}

	private assertLimit(limitCount: number | null | undefined): void {
		if (limitCount !== null && limitCount !== undefined && limitCount < 1) {
			throw new BadRequestException('limitCount must be greater than 0 or null');
		}
	}
}
