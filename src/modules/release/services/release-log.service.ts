import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { LessThan, Repository } from 'typeorm';
import { GetListReleaseLogDto } from '../dto/release-log.dto';
import { ReleaseLog, ReleaseLogStatus } from '../entities/release-log.entity';
import { enhanceReleaseDetail } from '../utils/release.utils';

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
		ReleaseLogStatus.PENDING,
		ReleaseLogStatus.SUCCESS,
		ReleaseLogStatus.FAILED,
	];

	constructor(
		@InjectRepository(ReleaseLog)
		private readonly releaseLogRepo: Repository<ReleaseLog>,
	) {}

	@Cron(CronExpression.EVERY_DAY_AT_1AM)
	async deleteOldLogs() {
		const cutoffDate = new Date();
		cutoffDate.setMonth(cutoffDate.getMonth() - 1);

		const result = await this.releaseLogRepo.delete({
			createdAt: LessThan(cutoffDate),
		});

		this.logger.log(
			`Deleted old release logs older than ${cutoffDate.toISOString()}, affected: ${result.affected ?? 0}`,
		);
	}

	async findAll(query: GetListReleaseLogDto) {
		const {
			startCreatedAt,
			endCreatedAt,
			keyword,
			releaseIds,
			dspIds,
			status,
			fieldOrder,
			orderBy,
			skip,
			pageSize,
		} = query;

		const qb = this.releaseLogRepo.createQueryBuilder('log');

		qb.leftJoinAndSelect('log.release', 'release')
			.leftJoinAndSelect('release.releaseCoverArts', 'releaseCoverArt')
			.leftJoinAndSelect('log.dsp', 'dsp');

		if (keyword) {
			qb.andWhere(
				`(
					log.dsp_code ILIKE :keyword
					OR log.logs ILIKE :keyword
					OR release.title ILIKE :keyword
					OR release.upc ILIKE :keyword
				)`,
				{
					keyword: `%${keyword[0]}%`,
				},
			);
		}

		if (startCreatedAt && endCreatedAt) {
			qb.andWhere('log.createdAt BETWEEN :start AND :end', {
				start: startCreatedAt,
				end: endCreatedAt,
			});
		}

		if (releaseIds && releaseIds.length > 0) {
			qb.andWhere('log.releaseId IN (:...releaseIds)', {
				releaseIds,
			});
		}

		if (dspIds && dspIds.length > 0) {
			qb.andWhere('log.dspId IN (:...dspIds)', {
				dspIds,
			});
		}

		if (status && status.length > 0) {
			qb.andWhere('log.status IN (:...status)', {
				status,
			});
		}

		qb.orderBy(`${fieldOrder}`, orderBy);
		qb.skip(skip).take(pageSize);

		const [data, totalItems] = await qb.getManyAndCount();
		const items = data.map((d) => ({
			...d,
			release: enhanceReleaseDetail(d.release),
		}));

		return new PageDto({
			items,
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
		const createdAt = new Date();

		const { releaseId, step, message, dspId, content, status } = data;

		const logText = `[${createdAt.toISOString()}] [Release ${releaseId}]${
			dspId ? ` [DSP ${dspId}]` : ''
		} [${step}] [${status}] ${message ?? ''}${
			content ? ` | content=${JSON.stringify(content)}` : ''
		}`;

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

		if (!this.shouldSaveToDb(status)) {
			return;
		}

		const entity = this.releaseLogRepo.create({
			releaseId,
			dspId: dspId ?? undefined,
			status,
			step,
			logs: message ?? undefined,
			content: content ?? null,
			createdAt,
		});

		this.releaseLogRepo.save(entity).catch((_e) => {
			this.logger.error(_e);
		});
	}

	private shouldSaveToDb(status: ReleaseLogStatus): boolean {
		return this.dbLogStatuses.includes(status);
	}
}
