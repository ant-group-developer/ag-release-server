import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { execFile } from 'child_process';
import * as path from 'path';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { AppEvent, DateFormat } from 'src/common/enums/common';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { AppConfigKey } from 'src/modules/app-config/enums/app-config.enum';
import { NotificationService } from 'src/modules/notification/services/notification.service';
import { generateFileNameWithTimestamp } from 'src/utils/util.date';
import { Repository } from 'typeorm';
import { promisify } from 'util';
import { QueryGetListBackup } from '../dto/database.dto';
import { Backup } from '../entities/database.backup.entity';
import { StatusBackup } from '../enums/database.enum';
const execFileAsync = promisify(execFile);

@Injectable()
export class DatabaseBackupService implements OnModuleInit {
	private logger = new Logger(DatabaseBackupService.name);

	private configDB: {
		type: string;
		host: string;
		port: number;
		username: string;
		password: string;
		database: string;
	};

	private notifyOnFailed: boolean;
	private notifyOnSuccess: boolean;

	private toDrive: boolean;
	private toGcs: boolean;

	private bucketName: string;
	private baseUrlGcs: string;

	private baseUrlConsoleGcsBackup: string;
	private fileName: string;
	private shell: string;

	constructor(
		@InjectRepository(Backup)
		private readonly backupRepo: Repository<Backup>,

		private readonly appConfigService: AppConfigService,
		private readonly configService: ConfigService,
		private readonly notificationService: NotificationService,
	) {
		this.configDB = {
			type: 'postgres',
			host: this.configService.get<string>('DB_HOST')!,
			port: this.configService.get<number>('DB_PORT') || 5432,
			username: this.configService.get<string>('DB_USERNAME')!,
			password: this.configService.get<string>('DB_PASSWORD')!,
			database: this.configService.get<string>('DB_DATABASE')!,
		};

		this.bucketName = this.configService.get<string>(
			'GCS_PROTECTED_BUCKET',
		)!;
		this.baseUrlGcs = this.configService.get<string>(
			'BACKUP_BASE_URL_GCS',
		)!;
		this.baseUrlConsoleGcsBackup = this.configService.get<string>(
			'BACKUP_BASE_URL_CONSOLE_GCS',
		)!;
	}

	onModuleInit() {
		this.reloadConfig();
	}

	@OnEvent(AppEvent.UPDATE_APP_CONFIG)
	handleAppConfigUpdated() {
		this.reloadConfig();
	}

	private reloadConfig() {
		this.toDrive = this.appConfigService.getValue(
			AppConfigKey.DATABASE_TO_DRIVE,
		);

		this.toGcs = this.appConfigService.getValue(
			AppConfigKey.DATABASE_TO_GCS,
		);

		this.notifyOnSuccess = this.appConfigService.getValue(
			AppConfigKey.NOTIFY_ON_SUCCESS,
		);

		this.notifyOnFailed = this.appConfigService.getValue(
			AppConfigKey.NOTIFY_ON_FAILED,
		);

		this.fileName = this.appConfigService.getValue(AppConfigKey.FILE_NAME);
		this.shell = this.appConfigService.getValue(AppConfigKey.SHELL);
	}

	async eventBackup() {
		const data = await this.newJobBackup();
		this.processTaskBackup(data).catch((_e) => {
			this.logger.error(_e);
		});
		return data.entityBackup;
	}

	private async newJobBackup() {
		const timeStart = Date.now();
		const fileName = this.generateBackupFileName();
		const backupPath = this.prepareBackupPath(fileName);

		const entity = this.backupRepo.create({
			...this.buildBackupRecord(fileName),
			status: StatusBackup.RUNNING,
			fileName,
		});

		const entityBackup = await this.backupRepo.save(entity);

		return { timeStart, backupPath, entityBackup };
	}

	private async processTaskBackup({
		timeStart,
		backupPath,
		entityBackup,
	}: {
		timeStart: number;
		backupPath: string;
		entityBackup: Backup;
	}) {
		const { fileSize, status, error } =
			await this.runScriptBackup(backupPath);

		entityBackup.status = status;
		entityBackup.fileSize = fileSize;
		entityBackup.error = error;
		entityBackup.elapsedTime = this.calculateElapsedTime(timeStart);

		const result = await this.backupRepo.save(entityBackup);
		await this.sendNotificationBackup(result);
	}

	private generateBackupFileName(): string {
		return generateFileNameWithTimestamp(
			this.fileName,
			DateFormat['YYYY-MM-DD_HH-mm-ss'],
		);
	}

	private prepareBackupPath(fileName: string): string {
		const backupDir = path.join(process.cwd(), 'backups');
		return path.join(backupDir, fileName);
	}

	private buildBackupRecord(fileName: string) {
		return {
			urlDrive: this.toDrive
				? '1pAzFumXPHykhMdkqehEOabwmVNJg8kAx/view?usp=drive_link'
				: null,
			urlGcs: this.toGcs
				? `${this.baseUrlGcs}/${this.bucketName}/backups/${fileName}`
				: null,
			urlFolderGcs: this.getUrlConsoleGcsBackup(fileName),
		};
	}

	private async runScriptBackup(backupPath: string) {
		const { username, host, port, database, password } = this.configDB;
		const scriptBackupPath = './scripts/script.backup.sh';

		try {
			const { stdout } = await execFileAsync(scriptBackupPath, {
				env: {
					DB_USER: username,
					DB_HOST: host,
					DB_PORT: String(port),
					DB_NAME: database,
					DB_PASSWORD: password,

					RCLONE_CONFIG: this.configService.get<string>(
						'BACKUP_RCLONE_CONFIG_PATH',
					)!,
					BUCKET_NAME: this.bucketName,
					BACKUP_PATH: backupPath,
				},
				shell: this.shell,
			});

			return {
				status: StatusBackup.SUCCESS,
				fileSize: this.parseFileSize(stdout),
				error: null,
			};
		} catch (error) {
			return {
				status: StatusBackup.FAILED,
				fileSize: 0,
				error: JSON.stringify(error),
			};
		}
	}

	private parseFileSize(stdout: string): number {
		let fileSize = 0;

		stdout
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.forEach((line) => {
				if (line.startsWith('FILE_SIZE:')) {
					const match = line.match(/FILE_SIZE:\s*(\d+)/);
					if (match) {
						fileSize = parseInt(match[1], 10);
					}
				}
			});

		return fileSize;
	}

	private calculateElapsedTime(start: number): number {
		return Math.floor((Date.now() - start) / 1000);
	}

	private getUrlConsoleGcsBackup(fileName: string) {
		return this.baseUrlConsoleGcsBackup + `/${fileName}`;
	}

	//
	async sendNotificationBackup(result: Backup) {
		const { status } = result;

		if (status === StatusBackup.SUCCESS && this.notifyOnSuccess) {
			await this.notificationService.notifyOnBackupSuccess(result);
		}
		if (status === StatusBackup.FAILED && this.notifyOnFailed) {
			await this.notificationService.notifyOnBackupFailed(result);
		}
	}

	async getList(query: QueryGetListBackup) {
		const { page, pageSize } = query;

		const qb = this.createQueryGetList(query);

		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: { pageSize, currentPage: page, totalItems },
		});
	}

	private createQueryGetList(query: QueryGetListBackup) {
		const {
			status,

			startCreatedAt,
			endCreatedAt,
			startUpdatedAt,
			endUpdatedAt,
			fieldOrder,
			orderBy,
			skip,
			pageSize,
		} = query;

		const qb = this.backupRepo.createQueryBuilder('backup');

		if (status) {
			qb.andWhere(`backup.status = :status`, { status });
		}

		if (startCreatedAt && endCreatedAt) {
			qb.andWhere(
				`backup.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{ startCreatedAt, endCreatedAt },
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			qb.andWhere(
				`backup.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{ startUpdatedAt, endUpdatedAt },
			);
		}

		qb.orderBy(`backup.${fieldOrder}`, orderBy);
		qb.skip(skip).take(pageSize);

		return qb;
	}
}
