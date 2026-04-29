import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { State51Email } from '../entities/state51-email.entity';
import { FileExportCiService } from 'src/modules/file-export-ci/file-export-ci.service';
import { NotificationResendService } from 'src/modules/notification/services/notification.resend-service';
import { ReleaseSubmitService2 } from './release-submit2.service';
import { Inject, forwardRef } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CreateState51EmailDto, QueryGetListState51EmailDto, UpdateState51EmailDto } from '../dto/state51-email.dto';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { PageDto } from 'src/common/dtos/common.response.dto';

@Injectable()
export class State51EmailService {
	private readonly logger = new Logger(State51EmailService.name);

	constructor(
		@InjectRepository(State51Email)
		private readonly repo: Repository<State51Email>,

		private readonly fileExportCiService: FileExportCiService,
		private readonly notificationResendService: NotificationResendService,

		@Inject(forwardRef(() => ReleaseSubmitService2))
		private readonly releaseSubmitService: ReleaseSubmitService2,
	) {}

	// ==========================================
	// CRUD
	// ==========================================

	/** Lấy danh sách (phân trang + lọc) */
	async getList(query: QueryGetListState51EmailDto) {
		const qb = this.repo.createQueryBuilder('email');

		if (query.isSent !== undefined) {
			const isSent = String(query.isSent) === 'true';
			qb.andWhere('email.isSent = :isSent', { isSent });
		}

		if (query.releaseId) {
			qb.andWhere('email.releaseId = :releaseId', { releaseId: query.releaseId });
		}

		if (query.upc) {
			qb.andWhere('email.upc LIKE :upc', { upc: `%${query.upc}%` });
		}

		orderAndPaging2({ qb, filter: query });
		const [items, total] = await qb.getManyAndCount();
		return new PageDto({
			items,
			metadata: {
				page: query.page,
				pageSize: query.limit,
				totalItems: total,
			},
		});
	}

	/** Lấy chi tiết */
	async findOne(id: string) {
		const record = await this.repo.findOne({ where: { id } });
		if (!record) throw new NotFoundException('State51 email record not found');
		return record;
	}

	/** Cập nhật */
	async update(id: string, dto: UpdateState51EmailDto) {
		const record = await this.findOne(id);
		Object.assign(record, dto);
		return this.repo.save(record);
	}

	/** Xóa */
	async delete(id: string) {
		const record = await this.findOne(id);
		return this.repo.remove(record);
	}

	/** Tạo record mới (gọi từ SEND_EMAIL_TO_STATE step hoặc API) */
	async enqueue(data: CreateState51EmailDto): Promise<State51Email> {
		const record = this.repo.create({
			...data,
			isSent: false,
		});
		return this.repo.save(record);
	}

	/** Lấy danh sách chờ gửi */
	async getPending(): Promise<State51Email[]> {
		return this.repo.find({
			where: { isSent: false },
			order: { createdAt: 'ASC' },
		});
	}

	/** Lấy danh sách theo ngày hôm nay chưa gửi */
	async getPendingToday(): Promise<State51Email[]> {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const tomorrow = new Date(today);
		tomorrow.setDate(tomorrow.getDate() + 1);

		return this.repo
			.createQueryBuilder('e')
			.where('e.is_sent = false')
			.andWhere('e.created_at >= :today', { today })
			.andWhere('e.created_at < :tomorrow', { tomorrow })
			.orderBy('e.created_at', 'ASC')
			.getMany();
	}

	// ==========================================
	// GỬI EMAIL
	// ==========================================

	/** Gửi 1 email theo id */
	async sendOne(id: string) {
		return this.sendMany([id]);
	}

	/** Core: Gửi nhiều emails theo mảng ids → group theo deliveryEmail → 1 file Excel per group */
	async sendMany(ids: string[]) {
		if (!ids?.length) return { sent: 0, resumed: 0 };

		const records = await this.repo.find({
			where: { id: In(ids), isSent: false },
		});

		if (records.length === 0) {
			this.logger.warn('No unsent records found for given IDs');
			return { sent: 0, resumed: 0 };
		}

		const baseDir = process.env.RELEASE_PARSED_DIR || path.resolve('release_parsed');
		const tempDir = path.join(baseDir, 'temp_exports', 'state51_batch');
		if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

		const dateStr = new Date().toISOString().slice(0, 10);
		let totalSent = 0;
		let totalResumed = 0;

		try {
			// Group theo deliveryEmail
			const grouped = new Map<string, State51Email[]>();
			for (const r of records) {
				const email = r.deliveryEmail || 'unknown';
				if (!grouped.has(email)) grouped.set(email, []);
				grouped.get(email)!.push(r);
			}

			for (const [toEmail, group] of grouped) {
				if (toEmail === 'unknown') {
					this.logger.warn(`Skipping ${group.length} records with no deliveryEmail`);
					continue;
				}

				// Tạo Excel cho group này
				const groupData = group.map((r) => ({
					upc: r.upc,
					listCodeDspCi: r.dspCiCodes,
				}));

				const buffer = await this.fileExportCiService.createFileExportCi({ data: groupData });
				const fileName = `CI_Batch_${dateStr}_${Date.now()}.xlsx`;
				const filePath = path.join(tempDir, fileName);
				fs.writeFileSync(filePath, buffer);

				// Lấy subject từ record đầu tiên trong group hoặc dùng mặc định
				const subjectTemplate = group[0].deliveryEmailSubject || `[Distribution] CI Batch - ${dateStr}`;

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

				// Mark group as sent
				const groupIds = group.map((r) => r.id);
				await this.repo.update(
					{ id: In(groupIds) },
					{ isSent: true, sentAt: new Date() },
				);

				// Resume release submit steps
				const stepIds = group
					.map((r) => r.releaseSubmitStepId)
					.filter((id): id is string => !!id);

				for (const stepId of stepIds) {
					try {
						await this.releaseSubmitService.resumeFromWaiting(stepId);
						totalResumed++;
					} catch (err) {
						this.logger.error(`Failed to resume step ${stepId}: ${err.message}`);
					}
				}

				totalSent += group.length;
			}

			this.logger.log(`Batch complete: ${totalSent} sent, ${totalResumed} steps resumed`);
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

	/** Gửi toàn bộ đang chờ */
	async sendAllPending() {
		const pending = await this.getPending();
		if (pending.length === 0) return { sent: 0 };
		return this.sendMany(pending.map((r) => r.id));
	}

	/** Gửi toàn bộ trong ngày hôm nay */
	async sendAllToday() {
		const today = await this.getPendingToday();
		if (today.length === 0) return { sent: 0 };
		return this.sendMany(today.map((r) => r.id));
	}

	// ==========================================
	// CRON — Tự động gửi cuối ngày
	// ==========================================

	/** Chạy 15:00 VN hàng ngày (08:00 UTC) */
	@Cron('0 8 * * *') // 08:00 UTC = 15:00 +7
	async handleDailySend() {
		this.logger.log('[CRON] Daily State51 email batch');
		try {
			const result = await this.sendAllPending();
			this.logger.log(`[CRON] Daily batch result: ${JSON.stringify(result)}`);
		} catch (err) {
			this.logger.error(`[CRON] Daily batch failed: ${err.message}`);
		}
	}
}
