import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { DateFormat } from 'src/common/enums/common';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { BucketR2Service } from 'src/modules/bucket2/services/bucket-r2.service';
import { NotificationService } from 'src/modules/notification/services/notification.service';
import { generateFileNameWithTimestamp } from 'src/utils/util.date';
import { Repository } from 'typeorm';
import { promisify } from 'util';
import { QueryGetListBackup } from '../dto/database.dto';
import { Backup } from '../entities/database.backup.entity';
import { StatusBackup } from '../enums/database.enum';
const execFileAsync = promisify(execFile);

@Injectable()
export class DatabaseBackupService {
	private logger = new Logger(DatabaseBackupService.name);

	constructor(
		@InjectRepository(Backup)
		private readonly backupRepo: Repository<Backup>,

		private readonly appConfigService: AppConfigService,
		private readonly configService: ConfigService,
		private readonly notificationService: NotificationService,
		private readonly bucketR2Service: BucketR2Service,
	) {}

	async eventBackup() {
		if (!this.appConfigService.cache.config.backupDatabase.enable) {
			throw new ResponseError({
				message: 'Tính năng Backup Database đang bị tắt',
			});
		}

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
			await this.runScriptBackupV2(backupPath);

		entityBackup.status = status;
		entityBackup.fileSize = fileSize;
		entityBackup.error = error;
		entityBackup.elapsedTime = this.calculateElapsedTime(timeStart);

		const result = await this.backupRepo.save(entityBackup);
		await this.sendNotificationBackup(result);
	}

	private generateBackupFileName(): string {
		const fileName =
			this.appConfigService.cache.config.backupDatabase.fileName;

		return generateFileNameWithTimestamp(
			fileName,
			DateFormat['YYYY-MM-DD_HH-mm-ss'],
		);
	}

	private prepareBackupPath(fileName: string): string {
		const backupDir = path.join(process.cwd(), 'backups');
		return path.join(backupDir, fileName);
	}

	private buildBackupRecord(fileName: string) {
		const cfg = this.appConfigService.cache.config.backupDatabase;

		return {
			urlDrive: cfg.toDrive
				? '1pAzFumXPHykhMdkqehEOabwmVNJg8kAx/view?usp=drive_link'
				: null,

			urlR2: cfg.baseUrlR2 + `/${fileName}`,
			urlFolderR2: cfg.baseUrlConsoleR2 + `/${fileName}`,
		};
	}

	private async runScriptBackup(backupPath: string) {
		const scriptBackupPath = './scripts/script.backup.sh';

		// DB config đọc trực tiếp từ env/config
		const username = this.configService.get<string>('DB_USERNAME')!;
		const host = this.configService.get<string>('DB_HOST')!;
		const port = this.configService.get<number>('DB_PORT') || 5432;
		const database = this.configService.get<string>('DB_DATABASE')!;
		const password = this.configService.get<string>('DB_PASSWORD')!;

		// Backup config đọc trực tiếp từ cache
		const cfg = this.appConfigService.cache.config.backupDatabase;

		// GCS/Rclone config đọc trực tiếp
		const bucketName = this.configService.get<string>(
			'GCS_PROTECTED_BUCKET',
		)!;
		const r2BucketName = this.configService.get<string>(
			'R2_PROTECTED_BUCKET',
		)!;
		const rcloneConfigPath = this.configService.get<string>(
			'BACKUP_RCLONE_CONFIG_PATH',
		)!;

		// Inject R2 credentials from env directly to rclone
		const r2AccessKeyId =
			this.configService.get<string>('R2_ACCESS_KEY_ID') || '';
		const r2SecretAccessKey =
			this.configService.get<string>('R2_SECRET_ACCESS_KEY') || '';
		const r2Endpoint = this.configService.get<string>('R2_ENDPOINT') || '';

		try {
			const { stdout } = await execFileAsync(scriptBackupPath, {
				env: {
					DB_USER: username,
					DB_HOST: host,
					DB_PORT: String(port),
					DB_NAME: database,
					DB_PASSWORD: password,

					RCLONE_CONFIG: rcloneConfigPath,
					BUCKET_NAME: bucketName,
					R2_BUCKET_NAME: r2BucketName,
					BACKUP_PATH: backupPath,

					TO_GCS: cfg.toGcs ? '1' : '',
					TO_R2: cfg.toR2 ? '1' : '',

					// Rclone remote "r2" configuration
					RCLONE_CONFIG_R2_TYPE: 's3',
					RCLONE_CONFIG_R2_PROVIDER: 'Ceph', // Or 'Cloudflare'
					RCLONE_CONFIG_R2_ACCESS_KEY_ID: r2AccessKeyId,
					RCLONE_CONFIG_R2_SECRET_ACCESS_KEY: r2SecretAccessKey,
					RCLONE_CONFIG_R2_ENDPOINT: r2Endpoint,
				},
				shell: cfg.shell,
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

	private async runScriptBackupV2(backupPath: string) {
		const backupDir = path.dirname(backupPath);
		if (!fs.existsSync(backupDir)) {
			fs.mkdirSync(backupDir, { recursive: true });
		}
		// Đọc cấu hình kết nối database từ config service
		const username = this.configService.get<string>('DB_USERNAME')!;
		const host = this.configService.get<string>('DB_HOST')!;
		const port = this.configService.get<number>('DB_PORT') || 5432;
		const database = this.configService.get<string>('DB_DATABASE')!;
		const password = this.configService.get<string>('DB_PASSWORD')!;
		try {
			// 1. Thực hiện dump dữ liệu bằng pg_dump trực tiếp thông qua execFile
			await execFileAsync(
				'pg_dump',
				[
					'-F',
					'c',
					'-U',
					username,
					'-h',
					host,
					'-p',
					String(port),
					'-f',
					backupPath,
					database,
				],
				{
					env: {
						...process.env,
						PGPASSWORD: password,
					},
				},
			);
			// 2. Lấy kích thước file backup
			const stats = await fs.promises.stat(backupPath);
			const fileSize = stats.size;
			// 3. Tải file lên Cloudflare R2 sử dụng BucketR2Service
			const fileName = path.basename(backupPath);
			await this.bucketR2Service.uploadFileFromPath({
				key: `backups/${fileName}`,
				filePath: backupPath,
				contentType: 'application/octet-stream',
				isPublic: false,
			});
			// 4. Xóa file backup tạm thời trên server cục bộ
			await fs.promises.unlink(backupPath);
			return {
				status: StatusBackup.SUCCESS,
				fileSize,
				error: null,
			};
		} catch (error) {
			this.logger.error('Database backup error details:', error);
			// Đảm bảo dọn dẹp file tạm trên server nếu phát sinh lỗi
			if (fs.existsSync(backupPath)) {
				try {
					await fs.promises.unlink(backupPath);
				} catch (unlinkError) {
					this.logger.warn(
						`Failed to delete temporary backup file: ${backupPath}`,
					);
				}
			}
			return {
				status: StatusBackup.FAILED,
				fileSize: 0,
				error:
					error instanceof Error
						? error.message
						: JSON.stringify(error),
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

	//
	async sendNotificationBackup(result: Backup) {
		const cfg = this.appConfigService.cache.config.backupDatabase;

		if (result.status === StatusBackup.SUCCESS && cfg.notifyOnSuccess) {
			await this.notificationService.notifyOnBackupSuccess(result);
		}

		if (result.status === StatusBackup.FAILED && cfg.notifyOnFailed) {
			await this.notificationService.notifyOnBackupFailed(result);
		}
	}

	async getList(query: QueryGetListBackup) {
		const { page, pageSize } = query;

		const qb = this.createQueryGetList(query);

		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: { pageSize, page, totalItems },
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
