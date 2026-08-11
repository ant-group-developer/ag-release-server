import {
	BadRequestException,
	forwardRef,
	Inject,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { PageDto } from 'src/common/dtos/common.response.dto';
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
import { CiDistributionJob3 } from '../entites/ci-distribution-job3.entity';
import {
	CiJobStatus3,
	CiJobType3,
	ReleaseExecutionStepStatus,
} from '../enums/release-execution3.enum';
import { ReleaseExecution3Service } from './release-execution3.service'; // hoặc service tương đương resume step

@Injectable()
export class CiDistributionJob3Service {
	private readonly logger = new Logger(CiDistributionJob3Service.name);

	constructor(
		@InjectRepository(CiDistributionJob3)
		private readonly repo: Repository<CiDistributionJob3>,

		private readonly log: LogsService,
		private readonly fileExportCiService: FileExportCiService,
		private readonly notificationResendService: NotificationResendService,

		@Inject(forwardRef(() => ReleaseExecution3Service))
		private readonly releaseExecutionService: ReleaseExecution3Service,

		private readonly ciToolService: CiToolService,
	) {}

	async checkCiToolJobStatus() {
		const jobs = await this.repo.find({
			where: {
				type: In([CiJobType3.ADMIN_EXPORT, CiJobType3.ADMIN_TAKEDOWN]),
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
				const status =
					await this.ciToolService.getExportJobStatus(ciToolJobId);

				if (status === 'success') {
					const completed = await this.finalizeJobs(groupJobs, {
						jobStatus: CiJobStatus3.COMPLETED,
						stepStatus: ReleaseExecutionStepStatus.DONE,
						nextCiToolCheckAt: null,
					});

					for (const job of groupJobs) {
						this.log.success({
							releaseExecutionId: job.releaseExecutionId,
							releaseExecutionStepId: job.stepId,
							message: `[CiJob3] CI Tool job completed, step DONE and pipeline rerun`,
							data: {
								ciToolJobId,
								ciToolStatus: status,
							},
						});
					}

					this.logger.log(
						`[CiTool] Job completed: ${ciToolJobId}, resumed=${completed.resumed}`,
					);

					continue;
				}

				if (status === 'failed') {
					const note = 'CI Tool job failed';

					await this.finalizeJobs(groupJobs, {
						jobStatus: CiJobStatus3.FAILED,
						stepStatus: ReleaseExecutionStepStatus.FAILED,
						note,
						nextCiToolCheckAt: null,
					});

					for (const job of groupJobs) {
						this.log.error({
							releaseExecutionId: job.releaseExecutionId,
							releaseExecutionStepId: job.stepId,
							message: `[CiJob3] CI Tool job failed, step FAILED`,
							data: {
								ciToolJobId,
								ciToolStatus: status,
							},
						});
					}

					this.logger.error(`[CiTool] Job failed: ${ciToolJobId}`);
					continue;
				}

				await this.repo.update(
					{ id: In(groupJobs.map((j) => j.id)) },
					{
						// nextCiToolCheckAt: new Date(Date.now() + 1 * 60 * 1000),
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

	async handleDailySend() {
		this.logger.log('[CRON] Daily CI distribution job batch v3');

		try {
			const pendingJobs = await this.repo.find({
				where: {
					status: CiJobStatus3.PENDING,
					type: In([
						CiJobType3.EMAIL_STATE51,
						CiJobType3.ADMIN_EXPORT,
						CiJobType3.ADMIN_TAKEDOWN,
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

			const result = await this.processJobs(
				pendingJobs.map((job) => job.id),
			);

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

	// main
	async processJobs(ids: string[]) {
		if (!ids?.length) {
			return {
				email: { sent: 0, resumed: 0 },
				ciTool: { sentToCi: 0 },
			};
		}

		const uniqueIds = [...new Set(ids)];
		const jobs = await this.repo.find({
			where: { id: In(uniqueIds) },
			order: { createdAt: 'ASC' },
		});

		if (!jobs.length) throw new NotFoundException('No jobs found');

		const foundIds = new Set(jobs.map((job) => job.id));
		const missingIds = uniqueIds.filter((id) => !foundIds.has(id));
		if (missingIds.length) {
			throw new NotFoundException(
				`CI distribution jobs not found: ${missingIds.join(', ')}`,
			);
		}

		const invalidJobs = jobs.filter(
			(job) => job.status !== CiJobStatus3.PENDING,
		);
		if (invalidJobs.length) {
			throw new BadRequestException(
				`Only PENDING jobs can be processed: ${invalidJobs
					.map((job) => `${job.id} (${job.status})`)
					.join(', ')}`,
			);
		}

		const jobsByType = new Map<CiJobType3, CiDistributionJob3[]>();
		for (const job of jobs) {
			const typeJobs = jobsByType.get(job.type) ?? [];
			typeJobs.push(job);
			jobsByType.set(job.type, typeJobs);
		}

		const unsupportedTypes = [...jobsByType.keys()].filter(
			(type) =>
				![
					CiJobType3.EMAIL_STATE51,
					CiJobType3.ADMIN_EXPORT,
					CiJobType3.ADMIN_TAKEDOWN,
				].includes(type),
		);
		if (unsupportedTypes.length) {
			throw new BadRequestException(
				`Unsupported CI job types: ${unsupportedTypes.join(', ')}`,
			);
		}

		const result = {
			email: { sent: 0, resumed: 0 },
			ciTool: {
				sentToCi: 0,
				ciToolJobId: undefined as string | undefined,
			},
			takedown: {
				sentToCi: 0,
				ciToolJobId: undefined as string | undefined,
			},
		};

		const emailJobs = jobsByType.get(CiJobType3.EMAIL_STATE51) ?? [];
		if (emailJobs.length) {
			result.email = await this.sendEmailToState51(emailJobs);
		}

		const adminExportJobs = jobsByType.get(CiJobType3.ADMIN_EXPORT) ?? [];
		if (adminExportJobs.length) {
			result.ciTool = await this.sendExportToCi(adminExportJobs);
		}

		const adminTakedownJobs = jobsByType.get(CiJobType3.ADMIN_TAKEDOWN) ?? [];
		if (adminTakedownJobs.length) {
			result.takedown = await this.sendTakedownToCi(adminTakedownJobs);
		}

		return result;
	}

	private async sendExportToCi(jobs: CiDistributionJob3[]) {
		const ids = jobs.map((job) => job.id);

		try {
			const { buffer, fileName } = await this.exportFileExcel(ids);

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
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: 'Unknown CI Tool export error';

			this.logger.error(
				`Failed to send export batch to CI Tool: ${message}`,
				error instanceof Error ? error.stack : undefined,
			);

			await this.finalizeJobs(jobs, {
				jobStatus: CiJobStatus3.FAILED,
				stepStatus: ReleaseExecutionStepStatus.FAILED,
				note: message,
				nextCiToolCheckAt: null,
			});

			return {
				sentToCi: 0,
				ciToolJobId: undefined,
			};
		}
	}

	private async sendTakedownToCi(jobs: CiDistributionJob3[]) {
		const ids = jobs.map((job) => job.id);

		try {
			// Tạo Excel file (tái sử dụng method export hiện có)
			const { buffer, fileName } = await this.exportTakedownExcel(ids);

			// Gửi đến CI Tool TAKEDOWN endpoint
			const ciResult = await this.ciToolService.sendFileTakedownToCi({
				buffer,
				originalname: fileName,
				mimetype:
					'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			});

			const ciToolJobId = ciResult?.jobId;

			if (!ciToolJobId) {
				throw new Error('CI Tool did not return a jobId');
			}

			// Cập nhật jobs sang PROCESSING status
			await this.repo.update(
				{ id: In(ids) },
				{
					status: CiJobStatus3.PROCESSING,
					ciToolJobId,
					nextCiToolCheckAt: new Date(Date.now() + 5 * 60 * 1000), // Check sau 5 phút
				},
			);

			this.logger.log(
				`[sendTakedownToCi] Đã gửi ${jobs.length} takedown jobs đến CI Tool, ciToolJobId=${ciToolJobId}`,
			);

			return { sentToCi: jobs.length, ciToolJobId };
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: 'Unknown CI Tool takedown error';

			this.logger.error(
				`[sendTakedownToCi] Thất bại khi gửi takedown batch: ${message}`,
				error instanceof Error ? error.stack : undefined,
			);

			// Đánh dấu jobs là FAILED
			await this.finalizeJobs(jobs, {
				jobStatus: CiJobStatus3.FAILED,
				stepStatus: ReleaseExecutionStepStatus.FAILED,
				note: message,
				nextCiToolCheckAt: null,
			});

			return { sentToCi: 0, ciToolJobId: undefined };
		}
	}

	private async sendEmailToState51(jobs: CiDistributionJob3[]) {
		const baseDir =
			process.env.RELEASE_PARSED_DIR || path.resolve('release_parsed');
		const tempDir = path.join(baseDir, 'temp_exports', 'ci_batch_v3');

		fs.mkdirSync(tempDir, { recursive: true });

		const dateStr = new Date().toISOString().slice(0, 10);
		let totalSent = 0;
		let totalResumed = 0;
		const jobsByEmail = new Map<string, CiDistributionJob3[]>();

		for (const job of jobs) {
			if (!job.deliveryEmail) {
				this.logger.warn(
					`Skipping CI job ${job.id}: deliveryEmail is missing`,
				);
				continue;
			}

			const emailJobs = jobsByEmail.get(job.deliveryEmail) ?? [];
			emailJobs.push(job);
			jobsByEmail.set(job.deliveryEmail, emailJobs);
		}

		for (const [toEmail, emailJobs] of jobsByEmail) {
			const ids = emailJobs.map((job) => job.id);
			let filePath: string | undefined;

			try {
				const { buffer, fileName } = await this.exportFileExcel(ids);
				filePath = path.join(tempDir, fileName);

				fs.writeFileSync(filePath, buffer);

				const subject =
					emailJobs[0].deliveryEmailSubject ||
					`[Distribution] CI Batch - ${dateStr}`;

				await this.repo.update(
					{ id: In(ids) },
					{ status: CiJobStatus3.PROCESSING },
				);

				const success = await this.notificationResendService.sendEmail({
					to: [toEmail],
					subject,
					html: `<p>${emailJobs.length} release(s) for distribution</p>`,
					attachments: [{ filename: fileName, path: filePath }],
				});

				if (!success) {
					throw new Error(
						`Email service failed to send batch to ${toEmail}`,
					);
				}

				const completed = await this.finalizeJobs(emailJobs, {
					jobStatus: CiJobStatus3.COMPLETED,
					stepStatus: ReleaseExecutionStepStatus.DONE,
				});

				totalSent += emailJobs.length;
				totalResumed += completed.resumed;
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: 'Unknown email delivery error';

				this.logger.error(
					`Failed to process email batch for ${toEmail}: ${message}`,
					error instanceof Error ? error.stack : undefined,
				);

				try {
					await this.finalizeJobs(emailJobs, {
						jobStatus: CiJobStatus3.FAILED,
						stepStatus: ReleaseExecutionStepStatus.FAILED,
						note: message,
					});
				} catch (finalizeError) {
					this.logger.error(
						`Failed to mark email batch as FAILED for ${toEmail}: ${
							finalizeError instanceof Error
								? finalizeError.message
								: 'Unknown finalize error'
						}`,
						finalizeError instanceof Error
							? finalizeError.stack
							: undefined,
					);
				}
			} finally {
				if (filePath && fs.existsSync(filePath)) {
					fs.unlinkSync(filePath);
				}
			}
		}

		this.logger.log(
			`[sendEmailToState51] ${totalSent} sent, ${totalResumed} steps resumed`,
		);

		return {
			sent: totalSent,
			resumed: totalResumed,
		};
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

	// tạo file excel từ các jobs
	async exportFileExcel(ids: string[]) {
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

		const dateStr = new Date().toISOString().slice(0, 10);
		const fileName = `CI_Export_${dateStr}_${Date.now()}.xlsx`;

		this.logger.log(
			`[exportFileExcel] Generated Excel for ${jobs.length} jobs`,
		);

		return { buffer: Buffer.from(buffer), fileName };
	}

	// tạo file excel cho takedown từ các jobs
	async exportTakedownExcel(ids: string[]) {
		const jobs = await this.repo.find({
			where: { id: In(ids) },
			order: { createdAt: 'ASC' },
		});

		if (!jobs.length) {
			throw new NotFoundException('Không tìm thấy takedown jobs');
		}

		// Cùng format Excel với export (UPC + DSP codes)
		const excelData = jobs.map((j) => ({
			upc: j.upc,
			listCodeDspCi: j.dspCiCodes,
		}));

		// Tái sử dụng Excel service hiện có
		const buffer = await this.fileExportCiService.createFileExportCi({
			data: excelData,
		});

		// Filename pattern khác để phân biệt trong logs
		const dateStr = new Date().toISOString().slice(0, 10);
		const fileName = `CI_Takedown_${dateStr}_${Date.now()}.xlsx`;

		this.logger.log(
			`[exportTakedownExcel] Generated Excel for ${jobs.length} takedown jobs`,
		);

		return { buffer: Buffer.from(buffer), fileName };
	}

	private async finalizeJobs(
		jobs: CiDistributionJob3[],
		options: {
			jobStatus: CiJobStatus3.COMPLETED | CiJobStatus3.FAILED;
			stepStatus:
				| ReleaseExecutionStepStatus.DONE
				| ReleaseExecutionStepStatus.FAILED;
			note?: string | null;
			nextCiToolCheckAt?: Date | null;
		},
	) {
		if (!jobs.length) return { finalized: 0, resumed: 0 };

		await this.repo.update(
			{ id: In(jobs.map((job) => job.id)) },
			{
				status: options.jobStatus,
				sentAt:
					options.jobStatus === CiJobStatus3.COMPLETED
						? new Date()
						: null,
				...(options.note !== undefined && { note: options.note }),
				...(options?.nextCiToolCheckAt !== undefined && {
					nextCiToolCheckAt: options.nextCiToolCheckAt,
				}),
			},
		);

		const stepIds = [
			...new Set(jobs.map((job) => job.stepId).filter(Boolean)),
		];
		let totalResumed = 0;

		for (const stepId of stepIds) {
			await this.releaseExecutionService.updateStatusStepAndRerunPipeline(
				{
					stepId,
					status: options.stepStatus,
				},
			);
			totalResumed++;
		}

		this.logger.log(
			`[finalizeJobs] ${jobs.length} jobs marked ${options.jobStatus}, ${totalResumed} steps updated`,
		);
		return { finalized: jobs.length, resumed: totalResumed };
	}

	// dùng khi cần update mail, mã code vv
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
