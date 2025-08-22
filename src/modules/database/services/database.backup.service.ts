import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { exec as execCallback } from 'child_process';
import * as fs from 'fs';
import { stat } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { PageDto } from 'src/common/dtos/response.dto';
import { AppEvent, DateFormat } from 'src/common/enums/common';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { AppConfigKey } from 'src/modules/app-config/enums/app-config.enum';
import { NotificationService } from 'src/modules/notification/services/notification.service';
import { generateFileNameWithTimestamp } from 'src/utils/util.date';
import { Repository } from 'typeorm';
import { promisify } from 'util';
import { BackupDto, QueryGetListBackup } from '../dto/database.dto';
import { Backup } from '../entities/database.backup.entity';
import { StatusBackup } from '../enums/database.enum';

@Injectable()
export class DatabaseBackupService implements OnModuleInit {
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

	private folderBackupDriveId: string;
	private baseUrlDrive: string;

	private bucketName: string;
	private baseUrlGcs: string;

	private urlFolderBucket: string;

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

		this.bucketName = this.configService.get<string>('PROTECTED_BUCKET')!;
		this.baseUrlDrive = 'https://drive.google.com/file/d/';
		this.baseUrlGcs = 'https://storage.cloud.google.com';
		this.urlFolderBucket =
			'https://console.cloud.google.com/storage/browser/ant-music-assets-protected/backups';
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

		this.notifyOnSuccess = this.appConfigService.getValue(
			AppConfigKey.NOTIFY_ON_FAILED,
		);
	}

	private async backup(data: BackupDto) {
		const { toDrive, toGcs } = data;

		const fileName = generateFileNameWithTimestamp(
			'backup_ant_release.sql',
			DateFormat['YYYY-MM-DD_HH-mm-ss'],
		);

		const timeStart = Date.now();
		const result = this.backupRepo.create({
			urlDrive: toDrive
				? '1pAzFumXPHykhMdkqehEOabwmVNJg8kAx/view?usp=drive_link'
				: null,
			urlGcs: toGcs
				? `${this.baseUrlGcs}/${this.bucketName}/backups/${fileName}`
				: null,
			status: StatusBackup.RUNNING,
			fileName,
		});

		const exec = promisify(execCallback);

		const backupDir = path.join(os.homedir(), 'backups');
		const backupPath = path.join(backupDir, fileName);

		if (!fs.existsSync(backupDir)) {
			fs.mkdirSync(backupDir, { recursive: true });
		}

		const exportDatabaseCommand = `"pg_dump" -U ${this.configDB.username} -h ${this.configDB.host} -p ${this.configDB.port} ${this.configDB.database} > "${backupPath}"`;
		const rcloneConfig = '--config=./database.rclone.conf';
		const shellPath = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';

		try {
			// Backup database
			await exec(exportDatabaseCommand, {
				env: { ...process.env, PGPASSWORD: this.configDB.password },
				shell: shellPath,
			});

			// // backup
			// if (toDrive) {
			// 	const driveUploadCommand = `rclone copy "${backupPath}" ${rcloneConfig} drive:/backups/ --progress`;

			// 	await exec(driveUploadCommand, { shell: shellPath });
			// }

			if (toGcs) {
				const gcsUploadCommand = `rclone copy "${backupPath}" ${rcloneConfig} gcs:/${this.bucketName}/backups/ --progress`;

				await exec(gcsUploadCommand, {
					shell: shellPath,
				});
			}

			const stats = await stat(backupPath);
			const fileSizeInBytes = stats.size;

			result.status = StatusBackup.SUCCESS;
			result.fileSize = fileSizeInBytes;
		} catch (_e) {
			result.status = StatusBackup.FAILED;
		} finally {
			const timeEnd = Date.now();
			result.elapsedTime = Math.floor((timeEnd - timeStart) / 1000);
		}

		return result;
	}

	async handleCreate() {
		const result = await this.backup({
			toDrive: this.toDrive,
			toGcs: this.toGcs,
		});

		const resultDb = await this.backupRepo.save(result);
		await this.sendNotificationBackup(resultDb);
	}

	handleCreateSafe() {
		this.handleCreate().catch((_e) => {
			console.log(_e);
		});
	}

	async sendNotificationBackup(result: Backup) {
		const { status } = result;

		if (status === StatusBackup.SUCCESS && this.notifyOnSuccess) {
			await this.notificationService.notifyOnBackupSuccess({
				...result,
				fileOnBucket: this.urlFolderBucket,
			});
		}
		if (status === StatusBackup.FAILED && this.notifyOnSuccess) {
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
