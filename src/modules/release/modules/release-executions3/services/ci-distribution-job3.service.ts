import {
	forwardRef,
	Inject,
	Injectable,
	Logger,
	NotFoundException,
	OnModuleInit,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
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
import { CiToolService } from 'src/modules/partners-api/ci-tool/ci-tool.service';
import { In, LessThanOrEqual, Repository } from 'typeorm';
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
import { ReleaseExecutionStepStatus } from '../enums/release-execution3.enum';
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

		private readonly ciToolService: CiToolService,
	) {}

	onModuleInit() {
		this.registerDailySendCron();
	}

	@OnEvent(AppEvent.UPDATE_APP_CONFIG)
	handleAppConfigUpdated() {
		this.registerDailySendCron();
	}

	/**
	 * Cron check CI Tool job status.
	 * Chạy mỗi phút, nhưng chỉ check job nào đã tới nextCiToolCheckAt.
	 */
	// @Cron('*/5 * * * *')
	// @Cron('* * * * *') // mỗi phút
	@Cron('*/10 * * * * *')
	async handleCheckCiToolJobStatus() {
		await this.checkCiToolJobStatus();
	}

	private async checkCiToolJobStatus() {
		const jobs = await this.repo.find({
			where: {
				type: CiJobType3.ADMIN_EXPORT,
				status: CiJobStatus3.PROCESSING,
				nextCiToolCheckAt: LessThanOrEqual(new Date()),
			},
			order: {
				createdAt: 'ASC',
			},
		});
		console.log('checkCiToolJobStatus - found jobs:', jobs.length);

		if (!jobs.length) return;

		// group lại theo job id
		const groups = new Map<string, CiDistributionJob3[]>();

		for (const job of jobs) {
			if (!job.ciToolJobId) continue;

			if (!groups.has(job.ciToolJobId)) {
				groups.set(job.ciToolJobId, []);
			}

			groups.get(job.ciToolJobId)!.push(job);
		}

		for (const [ciToolJobId, groupJobs] of groups) {
			try {
				const ciStatusResult =
					await this.ciToolService.getExportJobStatus(ciToolJobId);

				const status = ciStatusResult?.job?.status;

				if (status === 'success') {
					await this.repo.update(
						{ id: In(groupJobs.map((j) => j.id)) },
						{
							status: CiJobStatus3.COMPLETED,
							sentAt: new Date(),
							nextCiToolCheckAt: null,
						},
					);

					let totalResumed = 0;

					for (const job of groupJobs) {
						// await this.releaseExecutionService.doneStep(job.stepId);

						await this.releaseExecutionService.updateStatusStepAndRerunPipeline(
							{
								stepId: job.stepId,
								status: ReleaseExecutionStepStatus.DONE,
							},
						);
						this.log.success({
							releaseExecutionId: job.releaseExecutionId,
							releaseExecutionStepId: job.stepId,
							message: `[CiJob3] CI Tool job completed, step DONE and pipeline rerun`,
							data: {
								ciToolJobId,
								ciToolResult: ciStatusResult,
							},
						});

						totalResumed++;
					}

					this.logger.log(
						`[CiTool] Job completed: ${ciToolJobId}, resumed=${totalResumed}`,
					);

					continue;
				}

				if (status === 'failed') {
					await this.repo.update(
						{ id: In(groupJobs.map((j) => j.id)) },
						{
							status: CiJobStatus3.FAILED,
							note:
								ciStatusResult?.job?.message ||
								'CI Tool job failed',
							nextCiToolCheckAt: null,
						},
					);

					for (const job of groupJobs) {
						// await this.releaseExecutionService.doneStep(job.stepId);
						await this.releaseExecutionService.updateStatusStepAndRerunPipeline(
							{
								stepId: job.stepId,
								status: ReleaseExecutionStepStatus.DONE,
							},
						);
						this.log.error({
							releaseExecutionId: job.releaseExecutionId,
							releaseExecutionStepId: job.stepId,
							message: `[CiJob3] CI Tool job failed, step FAILED`,
							data: {
								ciToolJobId,
								ciToolResult: ciStatusResult,
							},
						});
					}

					this.logger.error(`[CiTool] Job failed: ${ciToolJobId}`);
					continue;
				}

				await this.repo.update(
					{ id: In(groupJobs.map((j) => j.id)) },
					{
						nextCiToolCheckAt: new Date(Date.now() + 1 * 60 * 1000),
						// nextCiToolCheckAt: new Date(Date.now() + 5 * 60 * 1000),
					},
				);

				this.logger.log(
					`[CiTool] Job still processing: ${ciToolJobId}, status=${status}`,
				);
			} catch (err) {
				await this.repo.update(
					{ id: In(groupJobs.map((j) => j.id)) },
					{
						nextCiToolCheckAt: new Date(Date.now() + 5 * 60 * 1000),
					},
				);

				this.logger.error(
					`[CiTool] Check job status failed: ${ciToolJobId} - ${err.message}`,
					err.stack,
				);
			}
		}
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
			// const cronExpression = '*/1 * * * *'; // mỗi phút, test nhanh
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
					status: CiJobStatus3.PENDING,
					type: In([
						CiJobType3.EMAIL_STATE51,
						CiJobType3.ADMIN_EXPORT,
					]),
				},
				order: {
					createdAt: 'ASC',
				},
			});

			if (!pendingJobs.length) {
				this.logger.log('[CRON] No pending jobs');
				return;
			}

			const emailJobIds = pendingJobs
				.filter((j) => j.type === CiJobType3.EMAIL_STATE51)
				.map((j) => j.id);

			const adminExportJobIds = pendingJobs
				.filter((j) => j.type === CiJobType3.ADMIN_EXPORT)
				.map((j) => j.id);

			const result: any = {
				email: { sent: 0, resumed: 0 },
				ciTool: { sentToCi: 0, resumed: 0 },
			};

			if (emailJobIds.length) {
				result.email = await this.autoSendEmail(emailJobIds);
				// console.log('Email job ids to send:', emailJobIds);
			}

			if (adminExportJobIds.length) {
				result.ciTool = await this.sendExportToCi(adminExportJobIds);
			}

			this.logger.log(
				`[CRON] Daily batch result: ${JSON.stringify(result)}`,
			);
		} catch (err) {
			this.logger.error(
				`[CRON] Daily batch failed: ${err.message}`,
				err.stack,
			);
		}
	}

	//
	async sendExportToCi(ids: string[]) {
		if (!ids?.length) throw new NotFoundException('No job ids provided');

		const jobs = await this.repo.find({
			where: { id: In(ids) },
			order: { createdAt: 'ASC' },
		});

		if (!jobs.length) throw new NotFoundException('No jobs found');

		const invalidType = jobs.filter(
			(j) => j.type !== CiJobType3.ADMIN_EXPORT,
		);

		if (invalidType.length) {
			throw new Error('Only ADMIN_EXPORT jobs can be sent to CI Tool');
		}

		const invalidStatus = jobs.filter(
			(j) => j.status !== CiJobStatus3.PENDING,
		);

		if (invalidStatus.length) {
			throw new Error('Only PENDING jobs can be sent to CI Tool');
		}

		const excelData = jobs.map((j) => ({
			upc: j.upc,
			listCodeDspCi: j.dspCiCodes,
		}));

		const buffer = await this.fileExportCiService.createFileExportCi({
			data: excelData,
		});

		const dateStr = new Date().toISOString().slice(0, 10);
		const fileName = `CI_Export_${dateStr}_${Date.now()}.xlsx`;

		const ciResult = await this.ciToolService.sendFileExportToCi({
			buffer,
			originalname: fileName,
			mimetype:
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		});

		const ciToolJobId = ciResult?.jobId;

		if (!ciToolJobId) {
			throw new Error('CI Tool did not return a jobId');
		}

		await this.repo.update(
			{ id: In(ids) },
			{
				status: CiJobStatus3.PROCESSING,
				ciToolJobId,
				nextCiToolCheckAt: new Date(Date.now() + 5 * 60 * 1000),
			},
		);

		this.logger.log(
			`[sendExportToCi] Sent ${jobs.length} jobs to CI Tool, ciToolJobId=${ciToolJobId}`,
		);

		return {
			sentToCi: jobs.length,
			ciToolJobId,
		};
	}

	async autoSendEmail(ids: string[]) {
		if (!ids?.length) return { sent: 0, resumed: 0 };

		const jobs = await this.repo.find({
			where: { id: In(ids) },
		});

		if (!jobs.length) {
			throw new NotFoundException('No jobs found');
		}

		await this.repo.update(
			{ id: In(ids) },
			{
				status: CiJobStatus3.PROCESSING,
			},
		);

		const baseDir =
			process.env.RELEASE_PARSED_DIR || path.resolve('release_parsed');
		const tempDir = path.join(baseDir, 'temp_exports', 'ci_batch_v3');

		fs.mkdirSync(tempDir, { recursive: true });

		const dateStr = new Date().toISOString().slice(0, 10);

		let totalSent = 0;
		let totalResumed = 0;

		try {
			const grouped = new Map<string, CiDistributionJob3[]>();

			for (const job of jobs) {
				const email = job.deliveryEmail || 'unknown';

				if (!grouped.has(email)) {
					grouped.set(email, []);
				}

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

				if (fs.existsSync(filePath)) {
					fs.unlinkSync(filePath);
				}

				if (!success) {
					this.logger.error(
						`Failed to send batch email to ${toEmail}`,
					);
					continue;
				}

				await this.repo.update(
					{ id: In(group.map((j) => j.id)) },
					{
						status: CiJobStatus3.COMPLETED,
						sentAt: new Date(),
					},
				);

				for (const job of group) {
					// await this.releaseExecutionService.retryStep(job.stepId);
					await this.releaseExecutionService.updateStatusStepAndRerunPipeline(
						{
							stepId: job.stepId,
							status: ReleaseExecutionStepStatus.NEW,
						},
					);
					totalResumed++;
				}

				totalSent += group.length;
			}

			this.logger.log(
				`[autoSendEmail] ${totalSent} sent, ${totalResumed} steps resumed`,
			);

			return {
				sent: totalSent,
				resumed: totalResumed,
			};
		} finally {
			if (fs.existsSync(tempDir)) {
				for (const f of fs.readdirSync(tempDir)) {
					fs.unlinkSync(path.join(tempDir, f));
				}

				if (!fs.readdirSync(tempDir).length) {
					fs.rmdirSync(tempDir);
				}
			}
		}
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
			// await this.releaseExecutionService.retryStep(stepId);
			await this.releaseExecutionService.updateStatusStepAndRerunPipeline(
				{
					stepId,
					status: ReleaseExecutionStepStatus.DONE,
				},
			);
		}

		this.logger.log(
			`[confirmCompleted] ${jobs.length} completed, ${totalResumed} steps resumed`,
		);
		return { completed: jobs.length, resumed: totalResumed };
	}

	async updateJob(id: string, body: UpdateCiJob3Dto) {
		body.status = CiJobStatus3.CANCEL;
		const job = await this.findOne(id);

		const updateData: Partial<CiDistributionJob3> = {};

		if (body.status === CiJobStatus3.CANCEL) {
			updateData.status = CiJobStatus3.CANCEL;
			updateData.note = 'User chủ động cancel';
			this.log.log({
				releaseExecutionId: job.releaseExecutionId,
				releaseExecutionStepId: job.stepId,
				message: `[CiJob3] Job ${job.type} cancel`,
			});
		}

		if (body.status !== undefined) {
			updateData.status = body.status;
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

		// Khi user cancel job → đánh dấu step tương ứng là cancel
		if (body.status === CiJobStatus3.CANCEL && job.stepId) {
			// await this.releaseExecutionService.cancelStep(job.stepId);
			await this.releaseExecutionService.updateStatusStepAndRerunPipeline(
				{
					stepId: job.stepId,
					status: ReleaseExecutionStepStatus.CANCELLED,
				},
			);
		}

		return this.findOne(id);
	}
}
