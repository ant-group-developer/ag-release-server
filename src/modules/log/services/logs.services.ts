import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { NotificationService } from 'src/modules/notification/services/notification.service';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { Repository } from 'typeorm';
import { QueryGetListLogDto } from '../dto/log.dto';
import { ErrorType, LogLevel, Logs } from '../entites/logs.entity';

type WriteLogDto = {
	level?: LogLevel;
	type?: ErrorType;
	module?: string;
	message?: string;
	data?: Record<string, any>;

	releaseSubmitId?: string;
	releaseSubmitStepId?: string;

	releaseExecutionId?: string;
	releaseExecutionStepId?: string;
};

@Injectable()
export class LogsService {
	private readonly logger = new Logger(LogsService.name);

	/**
	 * Config level nào sẽ persist DB
	 */
	private readonly saveDbLevels: LogLevel[] = [
		LogLevel.SUCCESS,
		LogLevel.LOG,
		LogLevel.ERROR,
		LogLevel.WARNING,
	];

	constructor(
		@InjectRepository(Logs)
		private readonly repo: Repository<Logs>,

		private readonly notificationService: NotificationService,
	) {}

	success(dto: Omit<WriteLogDto, 'level'>) {
		this.saveDbAndSendNotificationToDev_Safe({
			...dto,
			level: LogLevel.SUCCESS,
		});
	}

	log(dto: Omit<WriteLogDto, 'level'>) {
		this.saveDbAndSendNotificationToDev_Safe({
			...dto,
			level: LogLevel.LOG,
		});
	}

	warning(dto: Omit<WriteLogDto, 'level'>) {
		this.saveDbAndSendNotificationToDev_Safe({
			...dto,
			level: LogLevel.WARNING,
		});
	}

	error(dto: Omit<WriteLogDto, 'level'>) {
		this.saveDbAndSendNotificationToDev_Safe({
			...dto,
			level: LogLevel.ERROR,
		});
	}

	private saveDbAndSendNotificationToDev_Safe(data: WriteLogDto) {
		switch (data.level) {
			case LogLevel.ERROR:
				this.logger.error(data.message, data.data);
				break;

			case LogLevel.WARNING:
				this.logger.warn(data.message, data.data);
				break;

			default:
				this.logger.log(data.message, data.data);
				break;
		}

		// if (data.type === ErrorType.SYSTEM) {
		// 	this.notificationService
		// 		.sendToDev({
		// 			subject: `[${data.level}] SYSTEM ERROR`,
		// 			html: JSON.stringify(data, null, 2),
		// 		})
		// 		.catch((error) => this.logger.error(error));
		// }

		// skip persist
		if (!this.saveDbLevels.includes(data.level!)) {
			return;
		}

		// fire & forget db
		void this.repo.save(data).catch((error) => {
			this.logger.error('Cannot save log to database', error);
		});
	}

	// query
	async getList(query: QueryGetListLogDto) {
		const {
			page,
			pageSize,
			level,
			type,
			module,
			releaseSubmitId,
			releaseSubmitStepId,
		} = query;

		const qb = this.repo.createQueryBuilder('log');

		if (level?.length) {
			qb.andWhere('log.level IN (:...level)', { level });
		}

		if (type?.length) {
			qb.andWhere('log.type IN (:...type)', { type });
		}

		if (module) {
			qb.andWhere('log.module ILIKE :module', {
				module: `%${module}%`,
			});
		}

		if (releaseSubmitId) {
			qb.andWhere('log.releaseSubmitId = :releaseSubmitId', {
				releaseSubmitId,
			});
		}

		if (releaseSubmitStepId) {
			qb.andWhere('log.releaseSubmitStepId = :releaseSubmitStepId', {
				releaseSubmitStepId,
			});
		}

		orderAndPaging2({ qb, filter: query });

		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: { page, pageSize, totalItems },
		});
	}

	async getModules() {
		const rows = await this.repo
			.createQueryBuilder('log')
			.select('log.module', 'module')
			.where('log.module IS NOT NULL')
			.andWhere("log.module <> ''")
			.groupBy('log.module')
			.orderBy('LOWER(log.module)', 'ASC')
			.getRawMany<{ module: string | null }>();

		return rows
			.map((row) => row.module)
			.filter((module): module is string => !!module);
	}

	async getDetail(id: string) {
		const log = await this.repo.findOne({
			where: { id },
		});

		if (!log) {
			throw new NotFoundException('Log not found');
		}

		return log;
	}

	async delete(id: string) {
		const log = await this.getDetail(id);

		await this.repo.delete(log.id);

		return {
			success: true,
		};
	}
}
