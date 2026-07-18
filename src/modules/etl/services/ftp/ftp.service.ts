import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ftp from 'basic-ftp';
import * as fs from 'fs';
import * as path from 'path';
import { ExcludePatternService } from '../../../dsp-report/services/ftp-exclude-pattern.service';

export interface FtpConfig {
	host: string;
	port: number;
	user: string;
	password: string;
	secure: boolean;
	basePath: string;
	syncMode: string;
	syncCron: string;
}

@Injectable()
export class FtpService {
	private readonly logger = new Logger(FtpService.name);

	constructor(
		private readonly configService: ConfigService,
		private readonly excludePatternService: ExcludePatternService,
	) {}

	private getConfig(): FtpConfig {
		return {
			host: this.configService.get<string>('FTP_HOST') || '',
			port: parseInt(
				this.configService.get<string>('FTP_PORT') || '21',
				10,
			),
			user: this.configService.get<string>('FTP_USER') || '',
			password: this.configService.get<string>('FTP_PASSWORD') || '',
			secure:
				this.configService.get<string>('FTP_SECURE') === 'true' ||
				this.configService.get<string>('FTP_SECURE') === 'explicit',
			basePath:
				this.configService.get<string>('FTP_BASE_PATH') || '/root',
			syncMode:
				this.configService.get<string>('FTP_SYNC_MODE') || 'manual',
			syncCron:
				this.configService.get<string>('FTP_SYNC_CRON') || '0 2 * * *',
		};
	}

	/**
	 * Create and connect a new FTP client.
	 * Caller is responsible for closing via client.close().
	 */
	async connect(): Promise<ftp.Client> {
		const config = this.getConfig();
		const client = new ftp.Client();
		client.ftp.verbose = false;

		this.logger.log(`Connecting to FTPS ${config.host}:${config.port}...`);

		await client.access({
			host: config.host,
			port: config.port,
			user: config.user,
			password: config.password,
			secure: config.secure, // TLS Explicit
			secureOptions: { rejectUnauthorized: false },
		});

		this.logger.log('FTPS connected successfully');
		return client;
	}

	/**
	 * List all YYYYMM period folders available on FTPS.
	 * Scans both /root/trends/ and /root/usage/.
	 */
	async listPeriods(): Promise<string[]> {
		const config = this.getConfig();
		const client = await this.connect();
		const periods = new Set<string>();

		try {
			for (const category of [
				'trends',
				'usage',
				'sales',
				'illegitimate_activity',
			]) {
				const remotePath = `${config.basePath}/${category}`;
				try {
					const list = await client.list(remotePath);
					for (const item of list) {
						// Only YYYYMM folders (6 digits)
						if (item.isDirectory && /^\d{6}$/.test(item.name)) {
							periods.add(item.name);
						}
					}
				} catch (err) {
					this.logger.warn(
						`Cannot list ${remotePath}: ${err.message}`,
					);
				}
			}
		} finally {
			client.close();
		}

		return Array.from(periods).sort();
	}

	/**
	 * List DSP folders within a specific period+category.
	 * e.g. listDspFolders('trends', '202401') → ['aum-audiomack', 'fbk-facebook', ...]
	 */
	async listDspFolders(category: string, period: string): Promise<string[]> {
		const config = this.getConfig();
		const client = await this.connect();

		try {
			const remotePath = `${config.basePath}/${category}/${period}`;
			const list = await client.list(remotePath);
			return list
				.filter((item) => item.isDirectory)
				.map((item) => item.name);
		} catch (err) {
			this.logger.warn(
				`Cannot list DSP folders for ${category}/${period}: ${err.message}`,
			);
			return [];
		} finally {
			client.close();
		}
	}

	/**
	 * List all data files (recursively) in a remote DSP folder WITHOUT downloading.
	 * Returns sorted list of relative file names for change detection.
	 */
	async listRemoteFiles(
		category: string,
		period: string,
		dspFolder: string,
		fileSelector?: (relativePath: string) => boolean,
	): Promise<string[]> {
		const config = this.getConfig();
		const client = await this.connect();
		const remotePath = `${config.basePath}/${category}/${period}/${dspFolder}`;

		try {
			const files = await this.listFilesRecursive(
				client,
				remotePath,
				'',
				fileSelector,
			);
			return files.sort();
		} catch (err) {
			this.logger.warn(
				`Cannot list files for ${category}/${period}/${dspFolder}: ${err.message}`,
			);
			return [];
		} finally {
			client.close();
		}
	}

	/**
	 * Recursively list all file names in a remote directory.
	 * Returns file names relative to the root directory.
	 * Files matching exclude patterns (scope file/both) are omitted.
	 */
	private async listFilesRecursive(
		client: ftp.Client,
		remotePath: string,
		prefix: string,
		fileSelector?: (relativePath: string) => boolean,
	): Promise<string[]> {
		const list = await client.list(remotePath);
		const files: string[] = [];

		for (const item of list) {
			const relativeName = prefix ? `${prefix}/${item.name}` : item.name;
			if (item.isDirectory) {
				const subFiles = await this.listFilesRecursive(
					client,
					`${remotePath}/${item.name}`,
					relativeName,
					fileSelector,
				);
				files.push(...subFiles);
			} else if (item.isFile) {
				if (fileSelector && !fileSelector(relativeName)) continue;
				if (
					await this.excludePatternService.shouldExclude(
						item.name,
						'file',
					)
				) {
					this.logger.debug(
						`  ⛔ [EXCLUDED] Skip file ${item.name} (matched exclude pattern)`,
					);
					continue;
				}
				files.push(relativeName);
			}
		}

		return files;
	}

	/**
	 * Download an entire remote folder recursively to local path.
	 */
	async downloadFolder(
		client: ftp.Client,
		remotePath: string,
		localPath: string,
		prefix: string = '',
		fileSelector?: (relativePath: string) => boolean,
	): Promise<number> {
		// Ensure local directory exists
		fs.mkdirSync(localPath, { recursive: true });

		const list = await client.list(remotePath);
		let fileCount = 0;

		for (const item of list) {
			const remoteItemPath = `${remotePath}/${item.name}`;
			const localItemPath = path.join(localPath, item.name);
			const relativeName = prefix ? `${prefix}/${item.name}` : item.name;

			if (item.isDirectory) {
				fileCount += await this.downloadFolder(
					client,
					remoteItemPath,
					localItemPath,
					relativeName,
					fileSelector,
				);
			} else if (item.isFile) {
				if (fileSelector && !fileSelector(relativeName)) continue;
				if (
					await this.excludePatternService.shouldExclude(
						item.name,
						'file',
					)
				) {
					this.logger.debug(
						`  ⛔ [EXCLUDED] Skip download file ${item.name} (matched exclude pattern)`,
					);
					continue;
				}
				try {
					await client.downloadTo(localItemPath, remoteItemPath);
					// Verify download: check file exists and has content
					const stat = fs.statSync(localItemPath);
					if (stat.size === 0) {
						this.logger.warn(
							`Downloaded empty file: ${item.name} (remote size: ${item.size})`,
						);
					} else if (item.size > 0 && stat.size !== item.size) {
						this.logger.warn(
							`Size mismatch: ${item.name} — remote ${item.size} vs local ${stat.size}`,
						);
					}
					fileCount++;
				} catch (err) {
					this.logger.error(
						`Failed to download ${remoteItemPath}: ${err.message}`,
					);
				}
			}
		}

		return fileCount;
	}

	/**
	 * Download a specific period's data (both trends and usage) to local temp dir.
	 * Returns the local path where files were saved.
	 */
	async downloadPeriod(
		period: string,
		tempDir: string,
	): Promise<{ localPath: string; fileCount: number }> {
		const config = this.getConfig();
		const client = await this.connect();
		const localPath = path.join(tempDir, period);
		let totalFiles = 0;

		try {
			for (const category of ['trends', 'usage']) {
				const remotePath = `${config.basePath}/${category}/${period}`;
				const localCategoryPath = path.join(localPath, category);

				try {
					const dspFolders = await client.list(remotePath);
					const dspDirs = dspFolders.filter((f) => f.isDirectory);

					if (dspDirs.length > 0) {
						this.logger.log(
							`Downloading ${category}/${period}: ${dspDirs.length} DSP folders`,
						);

						for (const dsp of dspDirs) {
							const remoteDir = `${remotePath}/${dsp.name}`;
							const localDir = path.join(
								localCategoryPath,
								dsp.name,
							);
							const count = await this.downloadFolder(
								client,
								remoteDir,
								localDir,
							);
							totalFiles += count;
							this.logger.log(
								`  Downloaded ${dsp.name}: ${count} files`,
							);
						}
					}
				} catch (err) {
					this.logger.warn(
						`No ${category}/${period} on FTPS: ${err.message}`,
					);
				}
			}
		} finally {
			client.close();
		}

		return { localPath, fileCount: totalFiles };
	}

	/**
	 * Download a single DSP folder for a specific period+category.
	 */
	async downloadDspFolder(
		period: string,
		category: string,
		dspFolder: string,
		tempDir: string,
		fileSelector?: (relativePath: string) => boolean,
	): Promise<{ localPath: string; fileCount: number }> {
		const config = this.getConfig();
		const client = await this.connect();
		const remotePath = `${config.basePath}/${category}/${period}/${dspFolder}`;
		const localPath = path.join(tempDir, period, category, dspFolder);

		try {
			const fileCount = await this.downloadFolder(
				client,
				remotePath,
				localPath,
				'',
				fileSelector,
			);
			return { localPath, fileCount };
		} finally {
			client.close();
		}
	}

	/**
	 * Cleanup temp directory after import.
	 */
	cleanupTemp(dirPath: string): void {
		try {
			if (fs.existsSync(dirPath)) {
				fs.rmSync(dirPath, { recursive: true, force: true });
				this.logger.log(`Cleaned up: ${dirPath}`);
			}
		} catch (err) {
			this.logger.warn(`Cleanup failed for ${dirPath}: ${err.message}`);
		}
	}

	/**
	 * Test FTPS connection without downloading anything.
	 */
	async testConnection(): Promise<{
		ok: boolean;
		error?: string;
		basePath?: string;
		items?: any[];
	}> {
		try {
			const config = this.getConfig();
			const client = await this.connect();
			const list = await client.list(config.basePath);
			const items = list.map((f) => ({
				name: f.name,
				type: f.type,
				isDirectory: f.isDirectory,
				isFile: f.isFile,
				size: f.size,
			}));
			client.close();
			return { ok: true, basePath: config.basePath, items };
		} catch (err) {
			return { ok: false, error: err.message };
		}
	}
}
