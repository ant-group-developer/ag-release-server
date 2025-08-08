import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec as execCallback } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DateFormat } from 'src/common/enums/common';
import { NotificationService } from 'src/modules/notification/services/notification.service';
import { generateFileNameWithTimestamp } from 'src/utils/util.date';
import { promisify } from 'util';
import { BackupDto } from '../dto/database.dto';

@Injectable()
export class DatabaseBackupService {
	private configDB: {
		type: string;
		host: string;
		port: number;
		username: string;
		password: string;
		database: string;
	};

	constructor(
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

	async backup(data: BackupDto) {
		const { toDrive, toGcs } = data;

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
			if (toDrive) {
				const driveUploadCommand = `rclone copy "${backupPath}" ${rcloneConfig} drive:/backups/ --progress`;

				await exec(driveUploadCommand, { shell: shellPath });
			}

			if (toGcs) {
				const bucketName =
					this.configService.get<string>('PROTECTED_BUCKET');
				const gcsUploadCommand = `rclone copy "${backupPath}" ${rcloneConfig} gcs:/${bucketName}/backups/ --progress`;

				await exec(gcsUploadCommand, {
					shell: shellPath,
				});
			}

			await this.notificationService.sendNotificationBackupSuccess({
				filename,
			});
		} catch (err) {
			await this.notificationService.sendNotificationBackupFail({
				filename,
				error: err instanceof Error ? err.message : String(err),
			});

			throw new BadRequestException('Database backup failed');
		}
	}
}
