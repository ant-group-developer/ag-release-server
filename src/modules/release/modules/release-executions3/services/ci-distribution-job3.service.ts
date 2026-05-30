import {
	forwardRef,
	Inject,
	Injectable,
	Logger,
	NotFoundException,
	OnModuleInit,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import * as fs from 'fs';
import * as path from 'path';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { AppEvent } from 'src/common/enums/common';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { FileExportCiService } from 'src/modules/file-export-ci/file-export-ci.service';
import { LogsService } from 'src/modules/log/services/logs.services';
import { NotificationResendService } from 'src/modules/notification/services/notification.resend-service';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { In, Repository } from 'typeorm';
import {
	QueryGetListCiJob3Dto,
	QueryGroupedCiJob3Dto,
	UpdateCiJob3Dto,
} from '../dtos/ci-distribution-job3.dto';
import {
	CiDistributionJob3,
	CiJobStatus3,
	CiJobType3,
} from '../entites/ci-distribution-job3.entity';
import { ReleaseExecution3Service } from './release-execution3.service'; // hoặc service tương đương resume step

@Injectable()
export class CiDistributionJob3Service implements OnModuleInit {
	private readonly logger = new Logger(CiDistributionJob3Service.name);
	private static readonly CRON_JOB_NAME = 'ci-daily-send-v3';

	constructor(
		@InjectRepository(CiDistributionJob3)
		private readonly repo: Repository<CiDistributionJob3>,

		private readonly log: LogsService,
		private readonly fileExportCiService: FileExportCiService,
		private readonly notificationResendService: NotificationResendService,
		private readonly schedulerRegistry: SchedulerRegistry,
		private readonly appConfigService: AppConfigService,

		@Inject(forwardRef(() => ReleaseExecution3Service))
		private readonly releaseExecutionService: ReleaseExecution3Service,
	) { }

	onModuleInit() {
		this.registerDailySendCron();
	}

	@OnEvent(AppEvent.UPDATE_APP_CONFIG)
	handleAppConfigUpdated() {
		this.registerDailySendCron();
	}

	// ==========================================
	// Cron: hẹn lịch gửi
	// ==========================================

	private registerDailySendCron() {
		const jobName = CiDistributionJob3Service.CRON_JOB_NAME;

		const jobs = this.schedulerRegistry.getCronJobs();
		if (jobs.has(jobName)) {
			this.schedulerRegistry.deleteCronJob(jobName);
			this.logger.log(`Deleted existing cron job: ${jobName}`);
		}

		try {
			const cronExpression =
				this.appConfigService.cache?.config?.partners?.ci
					?.dailySendCron || '0 8 * * *';

			const job = new CronJob(cronExpression, () => {
				this.handleDailySend().catch((err) => {
					this.logger.error(
						`[CRON] Daily send failed: ${err.message}`,
					);
				});
			});

			this.schedulerRegistry.addCronJob(jobName, job);
			job.start();
			this.logger.log(
				`Registered cron job [${jobName}] with expression: ${cronExpression}`,
			);
		} catch (err) {
			this.logger.error(
				`Failed to create cron job [${jobName}]: ${(err as Error).message}`,
			);
		}
	}

	async handleDailySend() {
		this.logger.log('[CRON] Daily CI distribution job batch v3');
		try {
			const pendingJobs = await this.repo.find({
				where: {
					type: CiJobType3.EMAIL_STATE51,
					status: CiJobStatus3.PENDING,
				},
				order: { createdAt: 'ASC' },
			});

			if (!pendingJobs.length) {
				this.logger.log('[CRON] No pending email_state51 jobs');
				return;
			}

			const result = await this.autoSendEmail(
				pendingJobs.map((j) => j.id),
			);
			this.logger.log(
				`[CRON] Daily batch result: ${JSON.stringify(result)}`,
			);
		} catch (err) {
			this.logger.error(`[CRON] Daily batch failed: ${err.message}`);
		}
	}

	// ==========================================
	// Internal helpers
	// ==========================================

	private async checkAndResumeStep(
		stepId: string,
		releaseExecutionId: string,
		outputMetadataStep?: Record<string, any>,
	): Promise<boolean> {
		const pendingCount = await this.repo.count({
			where: {
				stepId,
				status: In([CiJobStatus3.PENDING, CiJobStatus3.PROCESSING]),
			},
		});

		if (pendingCount === 0) {
			this.logger.log(
				`[checkAndResumeStep] All jobs for step ${stepId} completed, resuming`,
			);
			try {
				await this.releaseExecutionService.resumeFromWaiting(stepId);
				this.log.success({
					releaseExecutionId,
					releaseExecutionStepId: stepId,
					message: `[CiJob3] All jobs completed, step resumed`,
				});
				return true;
			} catch (err) {
				this.logger.error(
					`Failed to resume step ${stepId}: ${err.message}`,
				);
			}
		} else {
			this.logger.log(
				`[checkAndResumeStep] ${pendingCount} jobs still pending for step ${stepId}`,
			);
		}

		return false;
	}

	// ==========================================
	// CRUD / Query
	// ==========================================

	async createJob(data: {
		type: CiJobType3;
		upc: string | null;
		dspCiCodes: string[];
		releaseExecutionId: string;
		stepId: string;
		releaseId: string | null;
		deliveryEmail?: string | null;
		deliveryEmailSubject?: string | null;
		stepLabel?: string;
	}) {
		const entity = this.repo.create({
			...data,
			status: CiJobStatus3.PENDING,
		});

		return this.repo.save(entity);
	}

	async getList(query: QueryGetListCiJob3Dto) {
		const qb = this.repo.createQueryBuilder('job');

		if (query.type) {
			qb.andWhere('job.type = :type', { type: query.type });
		}

		if (query.status?.length) {
			qb.andWhere('job.status IN (:...status)', {
				status: query.status,
			});
		}

		if (query.releaseExecutionId) {
			qb.andWhere('job.releaseExecutionId = :releaseExecutionId', {
				releaseExecutionId: query.releaseExecutionId,
			});
		}

		if (query.upc) {
			qb.andWhere('job.upc LIKE :upc', { upc: `%${query.upc}%` });
		}

		orderAndPaging2({ qb, filter: query });

		qb.leftJoin('job.release', 'release');
		qb.addSelect(['release.title']);

		const [items, total] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: {
				page: query.page,
				pageSize: query.pageSize,
				totalItems: total,
			},
		});
	}

	async getGrouped(query: QueryGroupedCiJob3Dto) {
		const page = Number(query.page || 1);
		const pageSize = Number(query.pageSize || 10);

		const qb = this.repo
			.createQueryBuilder('job')
			.select('job.type', 'type')
			.addSelect('job.delivery_email', 'deliveryEmail')
			.addSelect('job.delivery_email_subject', 'deliveryEmailSubject')
			.addSelect('DATE(job.created_at)', 'dateGroup')
			.addSelect('MIN(job.sent_at)', 'sentAt')
			.addSelect('ARRAY_AGG(DISTINCT job.upc)', 'upcs')
			.addSelect('ARRAY_AGG(DISTINCT job.status)', 'status')
			.addSelect(
				`JSON_AGG(JSON_BUILD_OBJECT(
                    'id', job.id,
                    'upc', job.upc,
                    'dspCodes', job.dsp_ci_codes,
                    'type', job.type,
                    'status', job.status,
                    'sentAt', job.sent_at,
                    'stepLabel', job.step_label,
                    'releaseExecutionId', job.release_execution_id,
                    'stepId', job.step_id,
                    'releaseId', job.release_id,
                    'deliveryEmail', job.delivery_email,
                    'deliveryEmailSubject', job.delivery_email_subject,
                    'createdAt', job.created_at,
                    'updatedAt', job.updated_at
                ) ORDER BY job.created_at DESC)`,
				'data',
			)
			.groupBy('job.type')
			.addGroupBy('job.delivery_email')
			.addGroupBy('job.delivery_email_subject')
			.addGroupBy('DATE(job.created_at)')
			.orderBy('DATE(job.created_at)', 'DESC');

		if (query.keyword?.length) {
			const keywords = query.keyword.map((k) => `%${k}%`);
			qb.andWhere(
				`(
                    job.type ILIKE ANY(:keywords)
                    OR job.upc ILIKE ANY(:keywords)
                    OR job.delivery_email ILIKE ANY(:keywords)
                    OR job.delivery_email_subject ILIKE ANY(:keywords)
                )`,
				{ keywords },
			);
		}

		if (query.type) {
			qb.andWhere('job.type = :type', { type: query.type });
		}

		if (query.dateGroup) {
			qb.andHaving('DATE(MIN(job.created_at)) = :dateGroup', {
				dateGroup: query.dateGroup,
			});
		}

		if (query.status?.length) {
			qb.andHaving('ARRAY_AGG(DISTINCT job.status) && :status', {
				status: query.status,
			});
		}

		if (query.upcs?.length) {
			qb.andHaving('ARRAY_AGG(DISTINCT job.upc) && :upcs', {
				upcs: query.upcs,
			});
		}

		const totalItems = await qb
			.clone()
			.select('COUNT(*)::int', 'count')
			.getRawMany()
			.then((rows) => rows.length);

		const items = await qb
			.offset((page - 1) * pageSize)
			.limit(pageSize)
			.getRawMany();

		return new PageDto({ items, metadata: { page, pageSize, totalItems } });
	}

	async findOne(id: string) {
		const job = await this.repo.findOne({
			where: { id },
			relations: {
				releaseExecution: true,
				step: true,
				release: true,
			},
		});

		if (!job) throw new NotFoundException('CI distribution job not found');

		return job;
	}

	findByStepId(stepId: string) {
		return this.repo.find({
			where: { stepId },
			order: { createdAt: 'DESC' },
		});
	}

	findPendingJobs() {
		return this.repo.find({
			where: { status: CiJobStatus3.PENDING },
			order: { createdAt: 'ASC' },
		});
	}

	// ==========================================
	// Admin actions
	// ==========================================

	async autoSendEmail(ids: string[]) {
		if (!ids?.length) return { sent: 0, resumed: 0 };

		const allJobs = await this.repo.find({ where: { id: In(ids) } });

		if (!allJobs.length) throw new NotFoundException('No jobs found');

		const baseDir =
			process.env.RELEASE_PARSED_DIR || path.resolve('release_parsed');
		const tempDir = path.join(baseDir, 'temp_exports', 'ci_batch_v3');
		fs.mkdirSync(tempDir, { recursive: true });

		const dateStr = new Date().toISOString().slice(0, 10);
		let totalSent = 0;
		let totalResumed = 0;

		try {
			// Group theo deliveryEmail
			const grouped = new Map<string, CiDistributionJob3[]>();
			for (const job of allJobs) {
				const email = job.deliveryEmail || 'unknown';
				if (!grouped.has(email)) grouped.set(email, []);
				grouped.get(email)!.push(job);
			}

			for (const [toEmail, group] of grouped) {
				if (toEmail === 'unknown') {
					this.logger.warn(
						`Skipping ${group.length} jobs with no deliveryEmail`,
					);
					continue;
				}

				const excelData = group.map((j) => ({
					upc: j.upc,
					listCodeDspCi: j.dspCiCodes,
				}));

				const buffer =
					await this.fileExportCiService.createFileExportCi({
						data: excelData,
					});

				const fileName = `CI_Batch_${dateStr}_${Date.now()}.xlsx`;
				const filePath = path.join(tempDir, fileName);
				fs.writeFileSync(filePath, buffer);

				const subject =
					group[0].deliveryEmailSubject ||
					`[Distribution] CI Batch - ${dateStr}`;

				const success = await this.notificationResendService.sendEmail({
					to: [toEmail],
					subject,
					html: `<p>${group.length} release(s) for distribution</p>`,
					attachments: [{ filename: fileName, path: filePath }],
				});

				if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

				if (!success) {
					this.logger.error(
						`Failed to send batch email to ${toEmail}`,
					);
					continue;
				}

				await this.repo.update(
					{ id: In(group.map((j) => j.id)) },
					{ status: CiJobStatus3.COMPLETED, sentAt: new Date() },
				);

				for (const job of group) {
					const resumed = await this.checkAndResumeStep(
						job.stepId,
						job.releaseExecutionId,
					);
					if (resumed) totalResumed++;
				}

				totalSent += group.length;
			}

			this.logger.log(
				`[autoSendEmail] ${totalSent} sent, ${totalResumed} steps resumed`,
			);
			return { sent: totalSent, resumed: totalResumed };
		} finally {
			if (fs.existsSync(tempDir)) {
				for (const f of fs.readdirSync(tempDir)) {
					fs.unlinkSync(path.join(tempDir, f));
				}
				if (!fs.readdirSync(tempDir).length) fs.rmdirSync(tempDir);
			}
		}
	}

	async downloadExcel(ids: string[]) {
		const jobs = await this.repo.find({
			where: { id: In(ids) },
			order: { createdAt: 'ASC' },
		});

		if (!jobs.length) throw new NotFoundException('No jobs found');

		const excelData = jobs.map((j) => ({
			upc: j.upc,
			listCodeDspCi: j.dspCiCodes,
		}));

		const buffer = await this.fileExportCiService.createFileExportCi({
			data: excelData,
		});

		await this.repo.update(
			{ id: In(ids) },
			{ status: CiJobStatus3.PROCESSING },
		);

		const dateStr = new Date().toISOString().slice(0, 10);
		const fileName = `CI_Export_${dateStr}_${Date.now()}.xlsx`;

		this.logger.log(
			`[downloadExcel] Generated Excel for ${jobs.length} jobs`,
		);

		return { buffer: Buffer.from(buffer), fileName };
	}

	async confirmCompleted(ids: string[], exportIdFromCi?: string) {
		if (!ids?.length) return { completed: 0, resumed: 0 };

		const jobs = await this.repo.find({ where: { id: In(ids) } });

		if (!jobs.length) throw new NotFoundException('No jobs found');

		await this.repo.update(
			{ id: In(jobs.map((j) => j.id)) },
			{ status: CiJobStatus3.COMPLETED, sentAt: new Date() },
		);

		const stepIds = [...new Set(jobs.map((j) => j.stepId))];
		let totalResumed = 0;

		for (const stepId of stepIds) {
			const resumed = await this.checkAndResumeStep(
				stepId,
				jobs.find((j) => j.stepId === stepId)!.releaseExecutionId,
			);
			if (resumed) totalResumed++;
		}

		this.logger.log(
			`[confirmCompleted] ${jobs.length} completed, ${totalResumed} steps resumed`,
		);
		return { completed: jobs.length, resumed: totalResumed };
	}

	async cancelJob(id: string) {
		const job = await this.findOne(id);

		await this.repo.update(job.id, {
			status: CiJobStatus3.SKIPPED,
			note: 'Cancelled by admin',
		});

		this.log.warning({
			releaseExecutionId: job.releaseExecutionId,
			releaseExecutionStepId: job.stepId,
			message: `[CiJob3] Job ${job.type} cancelled`,
		});

		return this.findOne(id);
	}

	async updateJob(id: string, body: UpdateCiJob3Dto) {
		const job = await this.findOne(id);

		const updateData: Partial<CiDistributionJob3> = {};

		if (body.status === 'skipped') {
			updateData.status = CiJobStatus3.SKIPPED;
			updateData.note = 'User chủ động cancel';
			this.log.warning({
				releaseExecutionId: job.releaseExecutionId,
				releaseExecutionStepId: job.stepId,
				message: `[CiJob3] Job ${job.type} skipped`,
			});
		}

		if (body.status && body.status !== 'skipped') {
			updateData.status = body.status as CiJobStatus3;
		}

		if (body.deliveryEmail !== undefined) {
			updateData.deliveryEmail = body.deliveryEmail;
		}

		if (body.deliveryEmailSubject !== undefined) {
			updateData.deliveryEmailSubject = body.deliveryEmailSubject;
		}

		if (body.dspCiCodes !== undefined) {
			updateData.dspCiCodes = body.dspCiCodes;
		}

		await this.repo.update(job.id, updateData);

		// Khi user skip job → đánh dấu step tương ứng là FAILED để pipeline propagate
		if (body.status === 'skipped' && job.stepId) {
			await this.releaseExecutionService.failStep(job.stepId);
		}

		return this.findOne(id);
	}
}
