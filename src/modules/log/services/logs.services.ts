import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NotificationService } from 'src/modules/notification/services/notification.service';
import { Repository } from 'typeorm';
import { ErrorType, LogLevel, Logs } from '../entites/logs.entity';

type WriteLogDto = {
	level?: LogLevel;
	type?: ErrorType;
	module?: string;
	message?: string;
	data?: Record<string, any>;

	releaseSubmitId?: string;
	releaseSubmitStepId?: string;
};

@Injectable()
export class LogsService {
	private readonly logger = new Logger('LogsService.nameadgda');

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

		if (data.type === ErrorType.SYSTEM) {
			this.notificationService
				.sendToDev({
					subject: `[${data.level}] SYSTEM ERROR`,
					html: JSON.stringify(data, null, 2),
				})
				.catch((error) => this.logger.error(error));
		}

		// skip persist
		if (!this.saveDbLevels.includes(data.level!)) {
			return;
		}

		// fire & forget db
		void this.repo.save(data).catch((error) => {
			this.logger.error('Cannot save log to database', error);
		});
	}
}
