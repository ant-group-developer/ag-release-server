import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Inject, forwardRef } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import {
	CiDistributionJob,
	CiJobStatus,
	CiJobType,
} from '../entities/ci-distribution-job.entity';
import { QueryGetListCiJobDto } from '../dto/ci-distribution-job.dto';
import { ReleaseSubmitService2 } from './release-submit2.service';
import { ReleaseSubmitLogService } from './release-submit-log.service';
import { FileExportCiService } from 'src/modules/file-export-ci/file-export-ci.service';
import { NotificationResendService } from 'src/modules/notification/services/notification.resend-service';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { PageDto } from 'src/common/dtos/common.response.dto';

@Injectable()
export class CiDistributionJobService {
	private readonly logger = new Logger(CiDistributionJobService.name);

	constructor(
		@InjectRepository(CiDistributionJob)
		private readonly repo: Repository<CiDistributionJob>,

		@Inject(forwardRef(() => ReleaseSubmitService2))
		private readonly releaseSubmitService: ReleaseSubmitService2,

		private readonly submitLog: ReleaseSubmitLogService,
		private readonly fileExportCiService: FileExportCiService,
		private readonly notificationResendService: NotificationResendService,
	) {}

	// ==========================================
	// CRUD / Query
	// ==========================================

	/** Lấy danh sách (phân trang + lọc) */
	async getList(query: QueryGetListCiJobDto) {
		const qb = this.repo.createQueryBuilder('job');

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

	/** Lấy chi tiết */
	async findOne(id: string) {
		const record = await this.repo.findOne({
			where: { id },
			relations: ['step'],
		});
		if (!record) throw new NotFoundException('CI distribution job not found');
		return record;
	}

	// ==========================================
	// Tạo job (gọi từ pipeline)
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

		const jobs = await this.repo.find({
			where: {
				id: In(ids),
				status: In([CiJobStatus.PENDING, CiJobStatus.PROCESSING]),
			},
		});

		if (jobs.length === 0) {
			this.logger.warn('No pending/processing jobs found for given IDs');
			return { sent: 0, resumed: 0 };
		}

		const baseDir = process.env.RELEASE_PARSED_DIR || path.resolve('release_parsed');
		const tempDir = path.join(baseDir, 'temp_exports', 'ci_batch');
		if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

		const dateStr = new Date().toISOString().slice(0, 10);
		let totalSent = 0;
		let totalResumed = 0;

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
					this.logger.warn(`Skipping ${group.length} jobs with no deliveryEmail`);
					continue;
				}

				// Tạo Excel cho group
				const excelData = group.map((j) => ({
					upc: j.upc,
					listCodeDspCi: j.dspCiCodes,
				}));

				const buffer = await this.fileExportCiService.createFileExportCi({ data: excelData });
				const fileName = `CI_Batch_${dateStr}_${Date.now()}.xlsx`;
				const filePath = path.join(tempDir, fileName);
				fs.writeFileSync(filePath, buffer);

				// Subject từ record đầu tiên hoặc mặc định
				const subjectTemplate =
					group[0].deliveryEmailSubject || `[Distribution] CI Batch - ${dateStr}`;

				const success = await this.notificationResendService.sendEmail({
					to: [toEmail],
					subject: subjectTemplate,
					html: `<p>${group.length} release(s) for distribution</p>`,
					attachments: [{ filename: fileName, path: filePath }],
				});

				if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

				if (!success) {
					this.logger.error(`Failed to send batch email to ${toEmail}`);
					continue;
				}

				// Mark completed + resume
				const groupIds = group.map((j) => j.id);
				await this.repo.update(
					{ id: In(groupIds) },
					{ status: CiJobStatus.COMPLETED, sentAt: new Date() },
				);

				for (const job of group) {
					try {
						await this.releaseSubmitService.resumeFromWaiting(job.stepId);
						totalResumed++;
					} catch (err) {
						this.logger.error(`Failed to resume step ${job.stepId}: ${err.message}`);
					}
				}

				totalSent += group.length;
			}

			this.logger.log(`[autoSendEmail] ${totalSent} sent, ${totalResumed} steps resumed`);
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
	async downloadExcel(ids: string[]): Promise<{ buffer: Buffer; fileName: string }> {
		if (!ids?.length) throw new Error('No job IDs provided');

		const jobs = await this.repo.find({
			where: {
				id: In(ids),
				status: In([CiJobStatus.PENDING, CiJobStatus.PROCESSING]),
			},
			order: { createdAt: 'ASC' },
		});

		if (jobs.length === 0) throw new NotFoundException('No pending/processing jobs found');

		// Tạo Excel
		const excelData = jobs.map((j) => ({
			upc: j.upc,
			listCodeDspCi: j.dspCiCodes,
		}));

		const buffer = await this.fileExportCiService.createFileExportCi({ data: excelData });

		// Mark as PROCESSING (admin đã tải, chờ xác nhận)
		await this.repo.update(
			{ id: In(ids) },
			{ status: CiJobStatus.PROCESSING },
		);

		const dateStr = new Date().toISOString().slice(0, 10);
		const fileName = `CI_Export_${dateStr}_${Date.now()}.xlsx`;

		this.logger.log(`[downloadExcel] Generated Excel for ${jobs.length} jobs`);
		return { buffer, fileName };
	}

	/**
	 * Admin xác nhận đã gửi — mark completed → resume pipeline
	 */
	async confirmCompleted(ids: string[]) {
		if (!ids?.length) return { completed: 0, resumed: 0 };

		const jobs = await this.repo.find({
			where: {
				id: In(ids),
				type: CiJobType.ADMIN_EXPORT,
				status: In([CiJobStatus.PENDING, CiJobStatus.PROCESSING]),
			},
		});

		if (jobs.length === 0) {
			return { completed: 0, resumed: 0 };
		}

		// Mark completed
		await this.repo.update(
			{ id: In(jobs.map((j) => j.id)) },
			{ status: CiJobStatus.COMPLETED, sentAt: new Date() },
		);

		// Resume pipeline steps
		let totalResumed = 0;
		for (const job of jobs) {
			try {
				await this.releaseSubmitService.resumeFromWaiting(job.stepId);
				totalResumed++;

				this.submitLog.success({
					releaseSubmitId: job.releaseSubmitId,
					releaseSubmitStepId: job.stepId,
					message: `[CiJob] Job ${job.type} confirmed completed, step resumed`,
				});
			} catch (err) {
				this.logger.error(`Failed to resume step ${job.stepId}: ${err.message}`);
			}
		}

		this.logger.log(`[confirmCompleted] ${jobs.length} completed, ${totalResumed} resumed`);
		return { completed: jobs.length, resumed: totalResumed };
	}

	/** Huỷ job */
	async cancelJob(id: string) {
		const job = await this.findOne(id);
		await this.repo.update(job.id, { status: CiJobStatus.FAILED });

		this.submitLog.warning({
			releaseSubmitId: job.releaseSubmitId,
			releaseSubmitStepId: job.stepId,
			message: `[CiJob] Job ${job.type} cancelled`,
		});

		return { message: 'Job cancelled' };
	}

	// ==========================================
	// CRON — Tự động gửi email cuối ngày
	// ==========================================

	/** Chạy 15:00 VN hàng ngày (08:00 UTC) — chỉ gửi type email_state51 */
	@Cron('0 8 * * *')
	async handleDailySend() {
		this.logger.log('[CRON] Daily CI distribution job batch');
		try {
			const pendingEmailJobs = await this.repo.find({
				where: {
					type: CiJobType.EMAIL_STATE51,
					status: CiJobStatus.PENDING,
				},
				order: { createdAt: 'ASC' },
			});

			if (pendingEmailJobs.length === 0) {
				this.logger.log('[CRON] No pending email_state51 jobs');
				return;
			}

			const ids = pendingEmailJobs.map((j) => j.id);
			const result = await this.autoSendEmail(ids);
			this.logger.log(`[CRON] Daily batch result: ${JSON.stringify(result)}`);
		} catch (err) {
			this.logger.error(`[CRON] Daily batch failed: ${err.message}`);
		}
	}
}
