import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { exec as execCallback } from 'child_process';
import * as fs from 'fs';
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
import { BackupDto } from '../dto/database.dto';
import { Backup } from '../entities/database.entity';
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
	}

	onModuleInit() {
		this.reloadConfig();
	}

	@OnEvent(AppEvent.UPDATE_APP_CONFIG)
	handleAppConfigUpdated() {
		this.reloadConfig();

		console.log(this.toDrive, this.toGcs);
	}

	private reloadConfig() {
		this.toDrive = this.appConfigService.getValue(
			AppConfigKey.DATABASE_TO_DRIVE,
		);

		this.toGcs = this.appConfigService.getValue(
			AppConfigKey.DATABASE_TO_GCS,
		);
	}

	private async backup(data: BackupDto) {
		const { toDrive, toGcs } = data;

		const timeStart = Date.now();
		const result = this.backupRepo.create({
			fileDirDrive: 'fileDirDrive',
			fileDirGcs: 'fileDirGcs',
			status: StatusBackup.RUNNING,
		});

		const exec = promisify(execCallback);

		const filename = generateFileNameWithTimestamp(
			'backup_ant_release.sql',
			DateFormat['YYYY-MM-DD_HH-mm-ss'],
		);

		const backupDir = path.join(os.homedir(), 'backups');
		const backupPath = path.join(backupDir, filename);

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

			// backup
			// if (toDrive) {
			// 	const driveUploadCommand = `rclone copy "${backupPath}" ${rcloneConfig} drive:/backups/ --progress`;

			// 	await exec(driveUploadCommand, { shell: shellPath });
			// }

			// if (toGcs) {
			// 	const bucketName =
			// 		this.configService.get<string>('PROTECTED_BUCKET');
			// 	const gcsUploadCommand = `rclone copy "${backupPath}" ${rcloneConfig} gcs:/${bucketName}/backups/ --progress`;

			// 	await exec(gcsUploadCommand, {
			// 		shell: shellPath,
			// 	});
			// }

			// await this.notificationService.sendNotificationBackupSuccess({
			// 	filename,
			// });

			result.status = StatusBackup.SUCCESS;
		} catch (err) {
			// await this.notificationService.sendNotificationBackupFail({
			// 	filename,
			// 	error: err instanceof Error ? err.message : String(err),
			// });

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

		return await this.backupRepo.save(result);
	}

	async getList() {
		const qb = this.backupRepo.createQueryBuilder();

		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
		});
	}
}
