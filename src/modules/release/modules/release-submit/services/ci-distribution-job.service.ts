import {
	Inject,
	Injectable,
	Logger,
	OnModuleInit,
	forwardRef,
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
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { CiDistributionJobException } from '../constants/ci-distribution-job.constant';
import {
	QueryGetListCiJobDto,
	QueryGroupedCiJobDto,
	UpdateCiJobDto,
} from '../dto/ci-distribution-job.dto';
import {
	CiDistributionJob,
	CiJobStatus,
	CiJobType,
} from '../entities/ci-distribution-job.entity';
import { ReleaseSubmitService2 } from './release-submit2.service';
import { CiToolService } from 'src/modules/partners-api/ci-tool/ci-tool.service';

@Injectable()
export class CiDistributionJobService implements OnModuleInit {
	private readonly logger = new Logger(CiDistributionJobService.name);
	private static readonly CRON_JOB_NAME = 'ci-daily-send';

	constructor(
		@InjectRepository(CiDistributionJob)
		private readonly repo: Repository<CiDistributionJob>,

		@Inject(forwardRef(() => ReleaseSubmitService2))
		private readonly releaseSubmitService: ReleaseSubmitService2,

		private readonly log: LogsService,
		private readonly fileExportCiService: FileExportCiService,
		private readonly notificationResendService: NotificationResendService,
		private readonly schedulerRegistry: SchedulerRegistry,
		private readonly appConfigService: AppConfigService,

		private readonly ciToolService: CiToolService
	) { }

	onModuleInit() {
		this.registerDailySendCron();
	}

	@OnEvent(AppEvent.UPDATE_APP_CONFIG)
	handleAppConfigUpdated() {
		this.registerDailySendCron();
	}

	// job gửi mail, tool ci
	private registerDailySendCron() {
		const jobName = CiDistributionJobService.CRON_JOB_NAME;

		// Xoá job cũ nếu tồn tại
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

	// ==========================================
	// CRUD / Query
	// ==========================================

	/** Lấy danh sách (phân trang + lọc) */
	async getList(query: QueryGetListCiJobDto) {
		const qb = this.repo.createQueryBuilder('job');

		if (query.keyword?.length) {
			const keywords = query.keyword.map((k) => `%${k}%`);

			qb.andWhere(
				`(
					job.type ILIKE ANY(:keywords)
					OR job.upc ILIKE ANY(:keywords)
					OR release.title ILIKE ANY(:keywords)
				)`,
				{ keywords },
			);
		}

		if (query.type) {
			qb.andWhere('job.type = :type', { type: query.type });
		}

		if (query.status?.length) {
			qb.andWhere('job.status IN (:...status)', { status: query.status });
		}

		if (query.releaseSubmitId) {
			qb.andWhere('job.releaseSubmitId = :releaseSubmitId', {
				releaseSubmitId: query.releaseSubmitId,
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

	async getGrouped(query: QueryGroupedCiJobDto) {
		const page = query.page || 1;
		const pageSize = query.pageSize || 10;

		const qb = this.repo
			.createQueryBuilder('job')
			.select('job.type', 'type')
			.addSelect('job.delivery_email', 'deliveryEmail')
			.addSelect('job.delivery_email_subject', 'deliveryEmailSubject')
			.addSelect('DATE(job.created_at)', 'dateGroup')
			.addSelect('MIN(job.sent_at)', 'sentAt')
			.addSelect(
				`JSON_AGG(JSON_BUILD_OBJECT(
				'id', job.id,
				'upc', job.upc,
				'dspCodes', job.dsp_ci_codes,
				'type', job.type,
				'status', job.status,
				'sentAt', job.sent_at,
				'stepLabel', job.step_label,
				'releaseSubmitId', job.release_submit_id,
				'stepId', job.step_id,
				'releaseId', job.release_id,
				'deliveryEmail', job.delivery_email,
				'deliveryEmailSubject', job.delivery_email_subject,
				'createdAt', job.created_at,
				'updatedAt', job.updated_at
			))`,
				'data',
			)
			.addSelect(`ARRAY_AGG(DISTINCT job.upc)`, 'upcs')
			.addSelect(`ARRAY_AGG(DISTINCT job.status)`, 'status')
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
				)`,
				{ keywords },
			);
		}

		if (query.type) {
			qb.andWhere('job.type = :type', { type: query.type });
		}

		if (query.dateGroup) {
			qb.having('DATE(MIN(job.created_at)) = :dateGroup', {
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

		const countQb = qb.clone();

		const totalItems = await countQb
			.select('COUNT(*)::int', 'count')
			.getRawMany()
			.then((rows) => rows.length);

		const items = await qb
			.offset((page - 1) * pageSize)
			.limit(pageSize)
			.getRawMany();

		return new PageDto({
			items,
			metadata: {
				page,
				pageSize,
				totalItems,
			},
		});
	}

	/** Lấy chi tiết */
	async findOne(id: string) {
		const record = await this.repo.findOne({
			where: { id },
			relations: ['step'],
		});
		if (!record) throw CiDistributionJobException.NOT_FOUND();
		return record;
	}

	/** Tìm job theo stepId */
	async findByStepId(stepId: string): Promise<CiDistributionJob | null> {
		return this.repo.findOne({ where: { stepId } });
	}

	/**
	 * Check tất cả jobs cùng stepId đã completed chưa.
	 * Nếu tất cả xong → resume step EXPORT_CI.
	 * Gọi sau mỗi lần complete job.
	 * Output để lưu vào metadata step nếu có
	 */

	private async checkAndResumeStep(
		stepId: string,
		releaseSubmitId: string,
		outputMetadataStep?: Record<string, any>,
	): Promise<boolean> {
		const pendingCount = await this.repo.count({
			where: {
				stepId,
				status: In([CiJobStatus.PENDING, CiJobStatus.PROCESSING]),
			},
		});

		if (pendingCount === 0) {
			this.logger.log(
				`[checkAndResumeStep] All jobs for step ${stepId} completed, resuming`,
			);
			try {
				await this.releaseSubmitService.resumeFromWaiting({
					stepId,
					outputMetadataStep,
				});
				this.log.success({
					releaseSubmitId,
					releaseSubmitStepId: stepId,
					message: `[CiJob] All jobs completed, EXPORT_CI step resumed`,
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
	// Tạo job (gọi từ EXPORT_CI step)
	// ==========================================

	/** Tạo job — gọi bởi SEND_EMAIL_TO_STATE hoặc WAITING_ADMIN_EXPORT step */
	async createJob(data: {
		type: CiJobType;
		upc: string | null;
		dspCiCodes: string[];
		releaseSubmitId: string;
		stepId: string;
		releaseId: string;
		deliveryEmail?: string | null;
		deliveryEmailSubject?: string | null;
		stepLabel?: string;
	}): Promise<CiDistributionJob> {
		const job = this.repo.create({
			type: data.type,
			upc: data.upc,
			dspCiCodes: data.dspCiCodes,
			releaseSubmitId: data.releaseSubmitId,
			stepId: data.stepId,
			releaseId: data.releaseId,
			deliveryEmail: data.deliveryEmail || null,
			deliveryEmailSubject: data.deliveryEmailSubject || null,
			stepLabel: data.stepLabel || null,
			status: CiJobStatus.PENDING,
		});
		const saved = await this.repo.save(job);

		this.logger.log(
			`[createJob] Created ${data.type} job ${saved.id} for step ${data.stepId}`,
		);
		return saved;
	}

	// ==========================================
	// Admin actions
	// ==========================================

	/**
	 * Auto Send Email — admin chọn 1 hoặc nhiều jobs → hệ thống tạo Excel → gửi email
	 * Chỉ gửi được jobs có type = email_state51 hoặc jobs có deliveryEmail
	 * Sau khi gửi → mark completed → resume pipeline
	 */
	async autoSendEmail(ids: string[]) {
		if (!ids?.length) return { sent: 0, resumed: 0 };

		// Validate type + status
		const allJobs = await this.repo.find({ where: { id: In(ids) } });
		const invalidType = allJobs.filter(
			(j) => j.type !== CiJobType.EMAIL_STATE51,
		);
		if (invalidType.length > 0) {
			throw CiDistributionJobException.INVALID_TYPE_EMAIL(
				invalidType.map((j) => j.id),
			);
		}
		const invalidStatus = allJobs.filter(
			(j) => ![CiJobStatus.PENDING].includes(j.status),
		);
		if (invalidStatus.length > 0) {
			throw CiDistributionJobException.INVALID_STATUS(
				'autoSendEmail',
				['pending'],
				invalidStatus.map((j) => ({ id: j.id, status: j.status })),
			);
		}

		const jobs = allJobs;

		if (jobs.length === 0) {
			this.logger.warn('No pending/processing jobs found for given IDs');
			return { sent: 0, resumed: 0 };
		}

		const baseDir =
			process.env.RELEASE_PARSED_DIR || path.resolve('release_parsed');
		const tempDir = path.join(baseDir, 'temp_exports', 'ci_batch');
		if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

		const dateStr = new Date().toISOString().slice(0, 10);
		let totalSent = 0;
		const totalResumed = 0;

		try {
			// Group theo deliveryEmail
			const grouped = new Map<string, CiDistributionJob[]>();
			for (const job of jobs) {
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

				// Tạo Excel cho group
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

				// Subject từ record đầu tiên hoặc mặc định
				const subjectTemplate =
					group[0].deliveryEmailSubject ||
					`[Distribution] CI Batch - ${dateStr}`;

				const success = await this.notificationResendService.sendEmail({
					to: [toEmail],
					subject: subjectTemplate,
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

				// Mark completed + resume
				const groupIds = group.map((j) => j.id);
				await this.repo.update(
					{ id: In(groupIds) },
					{ status: CiJobStatus.COMPLETED, sentAt: new Date() },
				);

				for (const job of group) {
					await this.checkAndResumeStep(
						job.stepId,
						job.releaseSubmitId,
					);
				}

				totalSent += group.length;
			}

			this.logger.log(
				`[autoSendEmail] ${totalSent} sent, ${totalResumed} steps resumed`,
			);
			return { sent: totalSent, resumed: totalResumed };
		} finally {
			// Cleanup temp dir
			if (fs.existsSync(tempDir)) {
				const remaining = fs.readdirSync(tempDir);
				for (const f of remaining) fs.unlinkSync(path.join(tempDir, f));
				if (fs.readdirSync(tempDir).length === 0) fs.rmdirSync(tempDir);
			}
		}
	}

	/**
	 * Download Excel — admin chọn jobs → tạo file Excel → return buffer
	 * Mark jobs as PROCESSING (chờ admin xác nhận đã gửi)
	 */
	async downloadExcel(
		ids: string[],
	): Promise<{ buffer: Buffer; fileName: string }> {
		if (!ids?.length) throw CiDistributionJobException.NO_IDS_PROVIDED();

		// Validate status
		const allJobs = await this.repo.find({
			where: { id: In(ids) },
			order: { createdAt: 'ASC' },
		});
		if (allJobs.length === 0)
			throw CiDistributionJobException.JOBS_NOT_FOUND();

		const invalidStatus = allJobs.filter(
			(j) =>
				![CiJobStatus.PENDING, CiJobStatus.PROCESSING].includes(
					j.status,
				),
		);
		if (invalidStatus.length > 0) {
			throw CiDistributionJobException.INVALID_STATUS(
				'downloadExcel',
				['pending', 'processing'],
				invalidStatus.map((j) => ({ id: j.id, status: j.status })),
			);
		}

		const jobs = allJobs;

		// Tạo Excel
		const excelData = jobs.map((j) => ({
			upc: j.upc,
			listCodeDspCi: j.dspCiCodes,
		}));

		const buffer = await this.fileExportCiService.createFileExportCi({
			data: excelData,
		});

		// Mark as PROCESSING (admin đã tải, chờ xác nhận)
		await this.repo.update(
			{ id: In(ids) },
			{ status: CiJobStatus.PROCESSING },
		);

		const dateStr = new Date().toISOString().slice(0, 10);
		const fileName = `CI_Export_${dateStr}_${Date.now()}.xlsx`;

		this.logger.log(
			`[downloadExcel] Generated Excel for ${jobs.length} jobs`,
		);
		return { buffer, fileName };
	}

	/**
	 * Admin xác nhận đã gửi — mark completed → resume pipeline
	 */
	async confirmCompleted(ids: string[], exportIdFromCi?: string) {
		if (!ids?.length) return { completed: 0, resumed: 0 };

		// Validate type + status
		const allJobs = await this.repo.find({ where: { id: In(ids) } });
		const invalidType = allJobs.filter(
			(j) => j.type !== CiJobType.ADMIN_EXPORT,
		);
		if (invalidType.length > 0) {
			throw CiDistributionJobException.INVALID_TYPE_ADMIN_EXPORT(
				invalidType.map((j) => j.id),
			);
		}
		const invalidStatus = allJobs.filter(
			(j) =>
				![CiJobStatus.PENDING, CiJobStatus.PROCESSING].includes(
					j.status,
				),
		);
		if (invalidStatus.length > 0) {
			throw CiDistributionJobException.INVALID_STATUS(
				'confirmCompleted',
				['pending', 'processing'],
				invalidStatus.map((j) => ({ id: j.id, status: j.status })),
			);
		}

		const jobs = allJobs;

		// Mark completed
		await this.repo.update(
			{ id: In(jobs.map((j) => j.id)) },
			{ status: CiJobStatus.COMPLETED, sentAt: new Date() },
		);

		// Build output để lưu vào step metadata
		// const outputMetadataStep = exportIdFromCi ? { exportIdFromCi } : undefined;

		// Check và resume EXPORT_CI step nếu tất cả jobs xong
		const stepIds = [...new Set(jobs.map((j) => j.stepId))];
		let totalResumed = 0;
		for (const stepId of stepIds) {
			const resumed = await this.checkAndResumeStep(
				stepId,
				jobs.find((j) => j.stepId === stepId)!.releaseSubmitId,
				// outputMetadataStep,
			);
			if (resumed) totalResumed++;
		}

		this.logger.log(
			`[confirmCompleted] ${jobs.length} completed, ${totalResumed} steps resumed`,
		);
		return { completed: jobs.length, resumed: totalResumed };
	}

	/** Huỷ job */
	async cancelJob(id: string) {
		const job = await this.findOne(id);
		await this.repo.update(job.id, { status: CiJobStatus.FAILED });

		this.log.warning({
			releaseSubmitId: job.releaseSubmitId,
			releaseSubmitStepId: job.stepId,
			message: `[CiJob] Job ${job.type} cancelled`,
		});

		return { message: 'Job cancelled' };
	}

	// ==========================================
	// CRON — Tự động gửi email cuối ngày
	// ==========================================

	/** Chạy theo lịch config partners.ci.dailySendCron */
	async handleDailySend() {
		this.logger.log('[CRON] Daily CI distribution job batch');

		try {
			const pendingJobs = await this.repo.find({
				where: {
					status: CiJobStatus.PENDING,
					type: In([
						CiJobType.EMAIL_STATE51,
						CiJobType.ADMIN_EXPORT,
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
				.filter((j) => j.type === CiJobType.EMAIL_STATE51)
				.map((j) => j.id);

			const adminExportJobIds = pendingJobs
				.filter((j) => j.type === CiJobType.ADMIN_EXPORT)
				.map((j) => j.id);

			const result: any = {
				email: { sent: 0, resumed: 0 },
				ciTool: { sentToCi: 0, resumed: 0 },
			};

			if (emailJobIds.length) {
				result.email = await this.autoSendEmail(emailJobIds);
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

	/**
	 * Cron check CI Tool job status.
	 * Chạy mỗi phút, nhưng chỉ check job nào đã tới nextCiToolCheckAt.
	 */
	@Cron('* * * * *')
	async handleCheckCiToolJobStatus() {
		await this.checkCiToolJobStatus();
	}

	private async checkCiToolJobStatus() {
		const jobs = await this.repo.find({
			where: {
				type: CiJobType.ADMIN_EXPORT,
				status: CiJobStatus.PROCESSING,
				nextCiToolCheckAt: LessThanOrEqual(new Date()),
			},
			order: {
				createdAt: 'ASC',
			},
		});

		if (!jobs.length) return;

		const groups = new Map<string, CiDistributionJob[]>();

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

				if (status === 'completed') {
					await this.repo.update(
						{ id: In(groupJobs.map((j) => j.id)) },
						{
							status: CiJobStatus.COMPLETED,
							sentAt: new Date(),
							nextCiToolCheckAt: null,
						},
					);

					const stepIds = [...new Set(groupJobs.map((j) => j.stepId))];

					let totalResumed = 0;

					for (const stepId of stepIds) {
						const job = groupJobs.find((j) => j.stepId === stepId)!;

						const resumed = await this.checkAndResumeStep(
							stepId,
							job.releaseSubmitId,
							{
								ciToolJobId,
								ciToolResult: ciStatusResult,
							},
						);

						if (resumed) totalResumed++;
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
							status: CiJobStatus.FAILED,
							note:
								ciStatusResult?.job?.message ||
								'CI Tool job failed',
							nextCiToolCheckAt: null,
						},
					);

					this.logger.error(`[CiTool] Job failed: ${ciToolJobId}`);
					continue;
				}

				await this.repo.update(
					{ id: In(groupJobs.map((j) => j.id)) },
					{
						nextCiToolCheckAt: new Date(Date.now() + 5 * 60 * 1000),
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

	async updateJob(id: string, dto: UpdateCiJobDto) {
		const job = await this.findOne(id);

		const updateData: Partial<CiDistributionJob> = {};

		if (dto.status === 'skipped') {
			updateData.status = CiJobStatus.SKIPPED;
			updateData.note = 'User chủ động cancel';
			this.log.warning({
				releaseSubmitId: job.releaseSubmitId,
				releaseSubmitStepId: job.stepId,
				message: `[CiJob] Job ${job.type} skipped`,
			});
		}

		if (dto.deliveryEmail !== undefined) {
			updateData.deliveryEmail = dto.deliveryEmail;
		}

		if (dto.dspCiCodes !== undefined) {
			updateData.dspCiCodes = dto.dspCiCodes;
		}

		if (dto.deliveryEmailSubject !== undefined) {
			updateData.deliveryEmailSubject = dto.deliveryEmailSubject;
		}

		await this.repo.update(job.id, updateData);

		return this.findOne(id);
	}

	async sendExportToCi(ids: string[]) {
		if (!ids?.length) throw CiDistributionJobException.NO_IDS_PROVIDED();

		const jobs = await this.repo.find({
			where: { id: In(ids) },
			order: { createdAt: 'ASC' },
		});

		if (!jobs.length) throw CiDistributionJobException.JOBS_NOT_FOUND();

		const invalidType = jobs.filter((j) => j.type !== CiJobType.ADMIN_EXPORT);
		if (invalidType.length) {
			throw CiDistributionJobException.INVALID_TYPE_ADMIN_EXPORT(
				invalidType.map((j) => j.id),
			);
		}

		const invalidStatus = jobs.filter(
			(j) => ![CiJobStatus.PENDING, CiJobStatus.PROCESSING].includes(j.status),
		);
		if (invalidStatus.length) {
			throw CiDistributionJobException.INVALID_STATUS(
				'sendExportToCi',
				['pending', 'processing'],
				invalidStatus.map((j) => ({ id: j.id, status: j.status })),
			);
		}

		const excelData = jobs.map((j) => ({
			upc: j.upc,
			listCodeDspCi: j.dspCiCodes,
		}));

		const buffer = await this.fileExportCiService.createFileExportCi({ data: excelData });

		const dateStr = new Date().toISOString().slice(0, 10);
		const fileName = `CI_Export_${dateStr}_${Date.now()}.xlsx`;

		// Mark PROCESSING trước khi gọi CI Tool
		await this.repo.update(
			{ id: In(ids) },
			{ status: CiJobStatus.PROCESSING },
		);

		const ciResult = await this.ciToolService.sendFileExportToCi({
			buffer,
			originalname: fileName,
			mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		});

		const ciToolJobId = ciResult?.jobId; // ← tuỳ shape response của ciToolService
		if (!ciToolJobId) {
			this.logger.error('[sendExportToCi] CI Tool did not return a jobId');
			throw new Error('CI Tool did not return a jobId');
		}

		// Lưu ciToolJobId + lên lịch check sau 5 phút
		await this.repo.update(
			{ id: In(ids) },
			{
				ciToolJobId,
				nextCiToolCheckAt: new Date(Date.now() + 5 * 60 * 1000),
			},
		);

		this.logger.log(
			`[sendExportToCi] Sent ${jobs.length} jobs to CI Tool, ciToolJobId=${ciToolJobId}`,
		);

		return { sentToCi: jobs.length, ciToolJobId };
	}
}
