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

export interface FtpRemoteFolderFiles {
	category: string;
	period: string;
	dspFolder: string;
	files: string[];
}

export interface FtpRemoteCategoryFiles {
	category: string;
	periodCount: number;
	periods: string[];
	folders: FtpRemoteFolderFiles[];
	failedPaths: string[];
}

export class FtpAuthenticationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'FtpAuthenticationError';
	}
}

/**
 * Leases one FTP connection across several operations so a unit of work costs a
 * single login instead of one per call. The server throttles repeated logins and
 * answers with 530, so reuse is what keeps a sync under that threshold.
 *
 * The connection is opened lazily and reopened transparently: basic-ftp closes a
 * client on timeout or connection error, and the control socket can also idle out
 * between calls.
 */
export class FtpSession {
	private client: ftp.Client | null = null;
	private closed = false;

	constructor(private readonly connectFn: () => Promise<ftp.Client>) {}

	async getClient(): Promise<ftp.Client> {
		if (this.closed) throw new Error('FtpSession is already closed');
		if (!this.client || this.client.closed) {
			this.client = await this.connectFn();
		}
		return this.client;
	}

	/** Drops the current connection so the next getClient() opens a fresh one. */
	invalidate(): void {
		if (this.client) {
			try {
				this.client.close();
			} catch {
				// Already dead; nothing to release.
			}
		}
		this.client = null;
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.invalidate();
	}
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
	 * Retries transient connection failures up to 3 times. Authentication failures
	 * are never retried because repeated 530 responses can lock the FTP account.
	 * Caller is responsible for closing via client.close().
	 */
	async connect(): Promise<ftp.Client> {
		const config = this.getConfig();
		const maxAttempts = 3;
		const retryDelayMs = 2000;
		let lastError: Error | undefined;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			const client = new ftp.Client();
			client.ftp.verbose = false;

			try {
				this.logger.log(
					`Connecting to FTPS ${config.host}:${config.port}...${attempt > 1 ? ` (attempt ${attempt}/${maxAttempts})` : ''}`,
				);
				await client.access({
					host: config.host,
					port: config.port,
					user: config.user,
					password: config.password,
					secure: config.secure,
					secureOptions: { rejectUnauthorized: false },
				});
				this.logger.log('FTPS connected successfully');
				return client;
			} catch (err) {
				client.close();
				lastError = err as Error;
				if (this.isAuthenticationError(lastError)) {
					throw new FtpAuthenticationError(lastError.message);
				}
				this.logger.warn(
					`FTPS connection attempt ${attempt}/${maxAttempts} failed: ${lastError.message}`,
				);
				if (attempt < maxAttempts) {
					await new Promise((resolve) =>
						setTimeout(resolve, retryDelayMs),
					);
				}
			}
		}

		throw lastError;
	}

	/**
	 * Opens a session the caller owns. The caller must close it, normally from a
	 * `finally`. Prefer `withSession` unless the work sits inside a loop that
	 * relies on `continue`, which a callback cannot express.
	 */
	createSession(): FtpSession {
		return new FtpSession(() => this.connect());
	}

	/**
	 * Runs an action against a single leased connection. Every FtpService method
	 * called with the supplied session shares that one login.
	 */
	async withSession<T>(
		action: (session: FtpSession) => Promise<T>,
	): Promise<T> {
		const session = this.createSession();
		try {
			return await action(session);
		} finally {
			session.close();
		}
	}

	/**
	 * Runs a single FTP operation, either on the caller's session or on a
	 * throwaway connection when no session is given. A session whose socket died
	 * between calls is reconnected once; a second failure is left to the caller.
	 */
	private async withSessionRetry<T>(
		session: FtpSession | undefined,
		op: (client: ftp.Client) => Promise<T>,
	): Promise<T> {
		const client = session ? await session.getClient() : await this.connect();
		try {
			return await op(client);
		} catch (error) {
			const err = error as Error;
			if (this.isAuthenticationError(err)) throw err;
			if (session && this.isDisconnected(err)) {
				this.logger.warn(
					`FTP session lost (${err.message}); reconnecting once`,
				);
				session.invalidate();
				return await op(await session.getClient());
			}
			throw err;
		} finally {
			if (!session) client.close();
		}
	}

	/**
	 * List all YYYYMM period folders available on FTPS.
	 * Scans both /root/trends/ and /root/usage/.
	 */
	async listPeriods(session?: FtpSession): Promise<string[]> {
		// All four categories share one login, so without a caller-supplied
		// session this opens its own rather than reconnecting per category.
		if (!session) return this.withSession((own) => this.listPeriods(own));

		const config = this.getConfig();
		const periods = new Set<string>();

		for (const category of [
			'trends',
			'usage',
			'sales',
			'illegitimate_activity',
		]) {
			const remotePath = `${config.basePath}/${category}`;
			try {
				const list = await this.withSessionRetry(session, (client) =>
					client.list(remotePath),
				);
				for (const item of list) {
					// Only YYYYMM folders (6 digits)
					if (item.isDirectory && /^\d{6}$/.test(item.name)) {
						periods.add(item.name);
					}
				}
			} catch (err) {
				if (this.isAuthenticationError(err as Error)) throw err;
				this.logger.warn(`Cannot list ${remotePath}: ${err.message}`);
			}
		}

		return Array.from(periods).sort();
	}

	/**
	 * List DSP folders within a specific period+category.
	 * e.g. listDspFolders('trends', '202401') → ['aum-audiomack', 'fbk-facebook', ...]
	 */
	async listDspFolders(
		category: string,
		period: string,
		session?: FtpSession,
	): Promise<string[]> {
		const config = this.getConfig();
		const remotePath = `${config.basePath}/${category}/${period}`;

		try {
			const list = await this.withSessionRetry(session, (client) =>
				client.list(remotePath),
			);
			return list
				.filter((item) => item.isDirectory)
				.map((item) => item.name);
		} catch (err) {
			if (this.isAuthenticationError(err as Error)) throw err;
			this.logger.warn(
				`Cannot list DSP folders for ${category}/${period}: ${err.message}`,
			);
			return [];
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
		applyGlobalExcludes = true,
		session?: FtpSession,
	): Promise<string[]> {
		const config = this.getConfig();
		const remotePath = `${config.basePath}/${category}/${period}/${dspFolder}`;

		try {
			const files = await this.withSessionRetry(session, (client) =>
				this.listFilesRecursive(
					client,
					remotePath,
					'',
					fileSelector,
					applyGlobalExcludes,
				),
			);
			return files.sort();
		} catch (err) {
			if (this.isAuthenticationError(err as Error)) throw err;
			this.logger.warn(
				`Cannot list files for ${category}/${period}/${dspFolder}: ${err.message}`,
			);
			return [];
		}
	}

	/**
	 * Discovery deliberately bypasses parser-specific selectors, but honours the
	 * global exclude configuration. A configured folder/file must not be added to
	 * the discovery catalog, sample queue, or auto-generated rules. Categories
	 * are isolated by connection: an FTP session issue while traversing a large
	 * category must not make subsequent categories disappear from an otherwise
	 * "completed" scan.
	 */
	async listAllRemoteReportFiles(
		categories: string[],
		minimumPeriods: Record<string, string | undefined> = {},
	): Promise<FtpRemoteCategoryFiles[]> {
		const results: FtpRemoteCategoryFiles[] = [];
		for (const category of categories) {
			results.push(
				await this.listRemoteReportFilesForCategory(
					category,
					minimumPeriods[category],
				),
			);
		}
		return results;
	}

	private async listRemoteReportFilesForCategory(
		category: string,
		minimumPeriod?: string,
	): Promise<FtpRemoteCategoryFiles> {
		const config = this.getConfig();
		const folders: FtpRemoteFolderFiles[] = [];
		const failedPaths: string[] = [];
		const periodEntries = await this.withFreshDiscoveryClientRetry(
			`discovery category ${category}`,
			(client) => client.list(`${config.basePath}/${category}`),
		);
		const allPeriods = periodEntries
			.filter((item) => item.isDirectory && /^\d{6}$/.test(item.name))
			.sort((left, right) => right.name.localeCompare(left.name));
		const periods = minimumPeriod
			? allPeriods.filter((item) => item.name >= minimumPeriod)
			: allPeriods;
		this.logger.log(
			`FTP discovery: ${category} has ${allPeriods.length} periods; scanning ${periods.length}${minimumPeriod ? ` from ${minimumPeriod}` : ' (full history)'} newest first`,
		);
		for (const periodEntry of periods) {
			const periodPath = `${config.basePath}/${category}/${periodEntry.name}`;
			try {
				const scan = await this.withFreshDiscoveryClientRetry(
					`discovery period ${category}/${periodEntry.name}`,
					async (client) => {
						const folderEntries = await client.list(periodPath);
						const periodFolders: FtpRemoteFolderFiles[] = [];
						let periodFiles = 0;
						for (const folderEntry of folderEntries.filter(
							(item) => item.isDirectory,
						)) {
							if (
								await this.excludePatternService.shouldExclude(
									folderEntry.name,
									'folder',
								)
							) {
								this.logger.debug(
									`  [EXCLUDED] Skip discovery folder ${category}/${periodEntry.name}/${folderEntry.name} (matched exclude pattern)`,
								);
								continue;
							}
							const folderPath = `${periodPath}/${folderEntry.name}`;
							const files = await this.listFilesRecursive(
								client,
								folderPath,
								'',
								undefined,
								true,
							);
							periodFiles += files.length;
							periodFolders.push({
								category,
								period: periodEntry.name,
								dspFolder: folderEntry.name,
								files: files.sort(),
							});
						}
						return {
							folderCount: periodFolders.length,
							periodFiles,
							periodFolders,
						};
					},
				);
				folders.push(...scan.periodFolders);
				this.logger.log(
					`FTP discovery: ${category}/${periodEntry.name} scanned ${scan.folderCount} folders, ${scan.periodFiles} files`,
				);
			} catch (error) {
				if (this.isAuthenticationError(error as Error)) throw error;
				this.logger.warn(
					`Cannot list discovery period ${category}/${periodEntry.name}: ${error.message}`,
				);
				failedPaths.push(`${category}/${periodEntry.name}`);
			}
		}
		const fileCount = folders.reduce(
			(total, folder) => total + folder.files.length,
			0,
		);
		const suffix = failedPaths.length
			? `, ${failedPaths.length} path(s) failed after retries`
			: '';
		this.logger.log(
			`FTP discovery: ${category} completed ${periods.length} periods, ${folders.length} folders, ${fileCount} files${suffix}`,
		);
		return {
			category,
			periodCount: periods.length,
			periods: periods.map((item) => item.name),
			folders,
			failedPaths,
		};
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
		applyGlobalExcludes = true,
	): Promise<string[]> {
		const list = await this.listDirectoryWithRetry(
			client,
			remotePath,
			`directory ${remotePath}`,
		);
		const files: string[] = [];

		for (const item of list) {
			const relativeName = prefix ? `${prefix}/${item.name}` : item.name;
			if (item.isDirectory) {
				if (
					applyGlobalExcludes &&
					(await this.excludePatternService.shouldExclude(
						item.name,
						'folder',
					))
				) {
					this.logger.debug(
						`  [EXCLUDED] Skip folder ${relativeName} (matched exclude pattern)`,
					);
					continue;
				}
				const subFiles = await this.listFilesRecursive(
					client,
					`${remotePath}/${item.name}`,
					relativeName,
					fileSelector,
					applyGlobalExcludes,
				);
				files.push(...subFiles);
			} else if (item.isFile) {
				if (fileSelector && !fileSelector(relativeName)) continue;
				if (
					applyGlobalExcludes &&
					(await this.excludePatternService.shouldExclude(
						item.name,
						'file',
					))
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

	private async listDirectoryWithRetry(
		client: ftp.Client,
		remotePath: string,
		label: string,
		maxAttempts = 3,
	): Promise<ftp.FileInfo[]> {
		let lastError: Error | null = null;
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				return await client.list(remotePath);
			} catch (error) {
				lastError = error as Error;
				if (this.isAuthenticationError(lastError)) throw lastError;
				if (this.isDisconnected(lastError)) throw lastError;
				if (attempt === maxAttempts) break;
				const delayMs = attempt * 750;
				this.logger.warn(
					`FTP ${label} failed (attempt ${attempt}/${maxAttempts}): ${lastError.message}; retrying in ${delayMs}ms`,
				);
				await new Promise((resolve) => setTimeout(resolve, delayMs));
			}
		}
		throw lastError || new Error(`Unable to list FTP ${label}`);
	}

	private async withFreshDiscoveryClientRetry<T>(
		label: string,
		action: (client: ftp.Client) => Promise<T>,
		maxAttempts = 3,
	): Promise<T> {
		let lastError: Error | null = null;
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			let client: ftp.Client | null = null;
			try {
				client = await this.connect();
				return await action(client);
			} catch (error) {
				lastError = error as Error;
				if (this.isAuthenticationError(lastError)) throw lastError;
				if (attempt === maxAttempts) break;
				const delayMs = attempt * 750;
				this.logger.warn(
					`FTP ${label} failed (attempt ${attempt}/${maxAttempts}): ${lastError.message}; reconnecting in ${delayMs}ms`,
				);
				await new Promise((resolve) => setTimeout(resolve, delayMs));
			} finally {
				client?.close();
			}
		}
		throw lastError || new Error(`Unable to list FTP ${label}`);
	}

	async downloadDiscoverySampleFile(
		category: string,
		period: string,
		dspFolder: string,
		relativePath: string,
		localPath: string,
	): Promise<void> {
		const config = this.getConfig();
		fs.mkdirSync(path.dirname(localPath), { recursive: true });
		await this.withFreshDiscoveryClientRetry(
			`discovery sample ${category}/${period}/${dspFolder}/${relativePath}`,
			(client) =>
				client.downloadTo(
					localPath,
					`${config.basePath}/${category}/${period}/${dspFolder}/${relativePath}`,
				),
		);
	}

	private isDisconnected(error: Error): boolean {
		return /ECONNRESET|control socket|client is closed|socket is closed|connection closed/i.test(
			error.message,
		);
	}

	private isAuthenticationError(error: Error): boolean {
		return (
			error instanceof FtpAuthenticationError ||
			/\b530\b|login incorrect|not logged in|authentication failed/i.test(
				error.message,
			)
		);
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
					if (this.isAuthenticationError(err as Error)) throw err;
					this.logger.error(
						`Failed to download ${remoteItemPath}: ${err.message}`,
					);
				}
			}
		}

		return fileCount;
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
		session?: FtpSession,
	): Promise<{ localPath: string; fileCount: number }> {
		const config = this.getConfig();
		const remotePath = `${config.basePath}/${category}/${period}/${dspFolder}`;
		const localPath = path.join(tempDir, period, category, dspFolder);

		const fileCount = await this.withSessionRetry(session, (client) =>
			this.downloadFolder(
				client,
				remotePath,
				localPath,
				'',
				fileSelector,
			),
		);
		return { localPath, fileCount };
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
