import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';

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

	constructor(private readonly configService: ConfigService) {
		this.configDB = {
			type: 'postgres',
			host: this.configService.get<string>('DB_HOST')!,
			port: this.configService.get<number>('DB_PORT') || 5432,
			username: this.configService.get<string>('DB_USERNAME')!,
			password: this.configService.get<string>('DB_PASSWORD')!,
			database: this.configService.get<string>('DB_DATABASE')!,
		};
	}

	async exportBackup() {
		const backupPath = 'C:\\path\\to\\backup\\my.sql';

		const setPasswordCommand = `set PGPASSWORD=${this.configDB.password}`;
		const exportDatabaseCommand = `"pg_dump" -U ${this.configDB.username} -h ${this.configDB.host} -p ${this.configDB.port} ${this.configDB.database} > ${backupPath}`;
		// const compressBackupCommand = `gzip ${backupPath}`;
		// const deleteUncompressedBackupCommand = `del  ${backupPath}`;

		const commands = [
			setPasswordCommand,
			exportDatabaseCommand,
			// compressBackupCommand,
			// deleteUncompressedBackupCommand,
		];

		const command = commands.join('&&');

		exec(command, (err, stdout, stderr) => {
			if (err) {
				console.error(`exec error: ${err}`);
				return;
			}

			// Upload to Google Drive
			const uploadCommand = `rclone copy "C:\\path\\to\\backup\\my.sql" gdrive:/backups/ --progress`;
			exec(uploadCommand, (uploadErr, uploadStdout, uploadStderr) => {
				if (uploadErr) {
					console.error(`Upload to GDrive failed: ${uploadErr}`);
					return;
				}
				if (uploadStderr) {
					console.error(`stderr during upload: ${uploadStderr}`);
					return;
				}
				console.log(`Upload to GDrive successful: ${uploadStdout}`);
			});

			// Upload to Google Cloud Storage (GCS)
			// const gcsUploadCommand = `rclone copy "C:\\path\\to\\backup\\my.sql" gcs:/your-bucket-name/backups/ --progress`;
			// exec(gcsUploadCommand, (gcsErr, gcsStdout, gcsStderr) => {
			// 	if (gcsErr) {
			// 		console.error(`Upload to GCS failed: ${gcsErr}`);
			// 		return;
			// 	}
			// 	if (gcsStderr) {
			// 		console.error(`stderr during GCS upload: ${gcsStderr}`);
			// 		return;
			// 	}
			// 	console.log(`Upload to GCS successful: ${gcsStdout}`);
			// });
		});
	}
}
