import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReleaseSubmitLog } from '../entities/release-submit-log.entity';
import { SubmitLogLevel } from '../release-submit.enum';

interface SubmitLogInput {
	/** Log cấp submit — chỉ cần field này */
	releaseSubmitId?: string | null;
	/** Log cấp step — nếu có sẽ tự resolve releaseSubmitId */
	releaseSubmitStepId?: string | null;
	message?: string;
	data?: Record<string, any>;
}

@Injectable()
export class ReleaseSubmitLogService {
	private readonly logger = new Logger(ReleaseSubmitLogService.name);

	/**
	 * Các log level được lưu vào DB.
	 * Thay đổi mảng này để filter — ví dụ bỏ LOG nếu chỉ muốn lưu lỗi/cảnh báo.
	 */
	private readonly persistLevels: SubmitLogLevel[] = [
		SubmitLogLevel.SUCCESS,
		SubmitLogLevel.LOG,
		SubmitLogLevel.ERROR,
		SubmitLogLevel.WARNING,
	];

	constructor(
		@InjectRepository(ReleaseSubmitLog)
		private readonly logRepo: Repository<ReleaseSubmitLog>,
	) {}

	// ==========================================
	// Public methods
	// ==========================================

	success(input: SubmitLogInput) {
		return this.logAndSaveDbSafe(SubmitLogLevel.SUCCESS, input);
	}

	log(input: SubmitLogInput) {
		return this.logAndSaveDbSafe(SubmitLogLevel.LOG, input);
	}

	error(input: SubmitLogInput) {
		return this.logAndSaveDbSafe(SubmitLogLevel.ERROR, input);
	}

	warning(input: SubmitLogInput) {
		return this.logAndSaveDbSafe(SubmitLogLevel.WARNING, input);
	}

	// ==========================================
	// Internal
	// ==========================================

	private logAndSaveDbSafe(level: SubmitLogLevel, input: SubmitLogInput) {
		// Console log luôn
		const tag = `[SubmitLog:${level}]`;
		const submitInfo = input.releaseSubmitId
			? ` Submit: ${input.releaseSubmitId}`
			: '';
		const stepInfo = input.releaseSubmitStepId
			? ` Step: ${input.releaseSubmitStepId}`
			: '';
		this.logger.log(`${tag}${submitInfo}${stepInfo} ${input.message ?? ''}`);

		this.saveDb(level, input).catch((err) => {
			this.logger.error(`[SubmitLog:writeSafe] Failed to persist log: ${err.message}`);
		})
	}

	private async saveDb(level: SubmitLogLevel, input: SubmitLogInput) {
		const tag = `[SubmitLog:${level}]`;
		// Check có lưu DB không
		if (!this.persistLevels.includes(level)) {
			return;
		}

		try {
			const entity = this.logRepo.create({
				releaseSubmitId: input.releaseSubmitId ?? null,
				releaseSubmitStepId: input.releaseSubmitStepId ?? null,
				level,
				message: input.message ?? null,
				data: input.data ?? null,
			});
			await this.logRepo.save(entity);
		} catch (err) {
			this.logger.error(
				`${tag} Failed to persist log: ${err.message}`,
			);
		}
	}
}
