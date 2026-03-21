import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';
import { GetListReleaseLogDto } from '../dto/release-log.dto';
import { ReleaseLog, ReleaseLogStatus } from '../entities/release-log.entity';

type ReleaseLogInput = {
	releaseId: string;
	step: string;
	message?: string;
	dspId?: string | null;
	codeDsp?: string | null;
	content?: unknown;
};

@Injectable()
export class ReleaseLogService {
	private readonly logger = new Logger(ReleaseLogService.name);

	/**
	 * Chỉ các status nằm trong mảng này mới được lưu DB.
	 * Muốn đổi rule thì sửa mỗi đây.
	 */
	private readonly dbLogStatuses: ReleaseLogStatus[] = [
		// ReleaseLogStatus.PENDING,
		// ReleaseLogStatus.SUCCESS,
		ReleaseLogStatus.FAILED,
	];

	constructor(
		@InjectRepository(ReleaseLog)
		private readonly releaseLogRepo: Repository<ReleaseLog>,
	) {}

	async findAll(query: GetListReleaseLogDto) {
		const { releaseIds, page = 1, limit = 10 } = query;

		const qb = this.releaseLogRepo.createQueryBuilder('log');

		if (releaseIds && releaseIds.length > 0) {
			qb.andWhere('log.releaseId IN (:...releaseIds)', {
				releaseIds,
			});
		}

		qb.orderBy('log.createdAt', 'DESC');
		qb.skip((page - 1) * limit).take(limit);

		const [data, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items: data,
			metadata: { ...query, totalItems },
		});
	}

	async remove(id: string) {
		await this.releaseLogRepo.delete(id);
	}

	pending(data: ReleaseLogInput) {
		return this.write({
			...data,
			status: ReleaseLogStatus.PENDING,
		});
	}

	success(data: ReleaseLogInput) {
		return this.write({
			...data,
			status: ReleaseLogStatus.SUCCESS,
		});
	}

	failed(data: ReleaseLogInput) {
		return this.write({
			...data,
			status: ReleaseLogStatus.FAILED,
		});
	}

	private write(
		data: ReleaseLogInput & {
			status: ReleaseLogStatus;
		},
	) {
		const {
			releaseId,
			step,
			message,
			dspId = null,
			content,
			status,
		} = data;

		const logText = `[Release ${releaseId}]${
			dspId ? ` [DSP ${dspId}]` : ''
		} [${step}] [${status}] ${message}${
			content ? ` | content=${JSON.stringify(content)}` : ''
		}`;

		// 1. luôn log ra màn hình
		switch (status) {
			case ReleaseLogStatus.FAILED:
				this.logger.error(logText);
				break;
			case ReleaseLogStatus.SUCCESS:
				this.logger.log(logText);
				break;
			case ReleaseLogStatus.PENDING:
			default:
				this.logger.warn(logText);
				break;
		}

		// 2. check config xem có lưu DB không
		if (!this.shouldSaveToDb(status)) {
			return;
		}

		// 3. lưu DB
		const entity = this.releaseLogRepo.create({
			releaseId,
			dspId,
			status,
			step,
			logs: message,
			content: content ?? null,
		});

		this.releaseLogRepo.save(entity).catch((_e) => {});
	}

	private shouldSaveToDb(status: ReleaseLogStatus): boolean {
		return this.dbLogStatuses.includes(status);
	}
}
