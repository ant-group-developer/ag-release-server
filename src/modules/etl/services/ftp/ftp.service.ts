import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ftp from 'basic-ftp';
import * as fs from 'fs';
import * as path from 'path';
import { connectFtpClient } from 'src/common/utils/ftp-client.util';
import { FtpProviderConfigService } from '../../../ftp-provider-config/services/ftp-provider-config.service';
import { ExcludePatternService } from '../../../dsp-report/services/ftp-exclude-pattern.service';

export interface FtpConfig {
	host: string;
	port: number;
	user: string;
	password: string;
	secure: boolean;
	basePath: string;
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

/** True when the FTP control socket is dead and the session must reconnect. */
export function isFtpDisconnectError(error: unknown): boolean {
	const message =
		error instanceof Error ? error.message : String(error ?? '');
	return /ECONNRESET|EPIPE|ENOTCONN|control socket|client is closed|socket is closed|connection closed|FIN packet/i.test(
		message,
	);
}

interface FtpLimiterWaiter {
	resolve: () => void;
	reject: (error: Error) => void;
	timer: NodeJS.Timeout | null;
	settled: boolean;
}

/**
 * Caps how many FTP connections this process opens at once. Local and in-memory
 * on purpose: a hung holder can only ever stall its own container, and it can
 * never make an unrelated request fail the way a shared Redis mutex did.
 *
 * The cap is per process. A cluster of N processes can hold up to
 * maxConnections × N connections against the server.
 */
export class FtpConnectionLimiter {
	private readonly logger = new Logger(FtpConnectionLimiter.name);
	private active = 0;
	private readonly waiters: FtpLimiterWaiter[] = [];

	constructor(
		private readonly maxConnections: number,
		private readonly maxWaitMs: number,
	) {}

	get activeCount(): number {
		return this.active;
	}

	get waitingCount(): number {
		return this.waiters.length;
	}

	/**
	 * Resolves with the slot's release function. Releasing twice is a no-op, so a
	 * caller can release defensively from both a catch and a finally.
	 */
	async acquire(context = 'ftp'): Promise<() => void> {
		if (this.active < this.maxConnections) {
			this.active++;
			return this.createRelease(context);
		}

		const startedAt = Date.now();
		this.logger.log(
			`Waiting for an FTP slot [${context}]: ${this.active}/${this.maxConnections} in use, ${this.waiters.length} already queued`,
		);
		await new Promise<void>((resolve, reject) => {
			const waiter: FtpLimiterWaiter = {
				resolve,
				reject,
				timer: null,
				settled: false,
			};
			waiter.timer = setTimeout(() => {
				if (waiter.settled) return;
				waiter.settled = true;
				const index = this.waiters.indexOf(waiter);
				if (index >= 0) this.waiters.splice(index, 1);
				reject(
					new Error(
						`Timed out after ${this.maxWaitMs}ms waiting for a free FTP connection slot [${context}] (limit ${this.maxConnections} per process)`,
					),
				);
			}, this.maxWaitMs);
			this.waiters.push(waiter);
		});
		// The slot was handed over directly by release(), so `active` already
		// counts it — incrementing here would double-count and overshoot the cap.
		this.logger.log(
			`Acquired FTP slot [${context}] after waiting ${Date.now() - startedAt}ms`,
		);
		return this.createRelease(context);
	}

	private createRelease(context: string): () => void {
		let released = false;
		return () => {
			if (released) return;
			released = true;
			// Hand the slot straight to the next waiter instead of decrementing
			// first: a decrement would briefly open a gap that a fresh acquire()
			// could take, letting the queue push active past maxConnections.
			const next = this.waiters.shift();
			if (next) {
				next.settled = true;
				if (next.timer) clearTimeout(next.timer);
				next.resolve();
				return;
			}
			this.active--;
			this.logger.debug(
				`Released FTP slot [${context}]: ${this.active}/${this.maxConnections} in use`,
			);
		};
	}
}

/**
 * Leases one FTP connection across several operations so a unit of work costs a
 * single login instead of one per call. The session holds exactly one
 * FtpConnectionLimiter slot from its first connect until close().
 */
export class FtpSession {
	private client: ftp.Client | null = null;
	private closed = false;
	private releaseSlot: (() => void) | null = null;

	constructor(
		private readonly connectFn: () => Promise<ftp.Client>,
		private readonly acquireSlot: () => Promise<() => void>,
	) {}

	async getClient(): Promise<ftp.Client> {
		if (this.closed) throw new Error('FtpSession is already closed');
		if (!this.client || this.client.closed) {
			if (!this.releaseSlot) this.releaseSlot = await this.acquireSlot();
			try {
				this.client = await this.connectFn();
			} catch (error) {
				this.releaseSlot?.();
				this.releaseSlot = null;
				throw error;
			}
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
		this.releaseSlot?.();
		this.releaseSlot = null;
	}
}

@Injectable()
export class FtpService {
	private readonly logger = new Logger(FtpService.name);
	private readonly connectionLimiter: FtpConnectionLimiter;

	/** Max time a caller waits for a free slot before acquire() rejects. */
	private static readonly SLOT_WAIT_TIMEOUT_MS = 5 * 60 * 1000;

	constructor(
		private readonly configService: ConfigService,
		private readonly excludePatternService: ExcludePatternService,
		private readonly ftpProviderConfigService: FtpProviderConfigService,
	) {
		const configuredMax = Number(
			this.configService.get<string>('FTP_MAX_CONNECTIONS') || 3,
		);
		this.connectionLimiter = new FtpConnectionLimiter(
			Number.isInteger(configuredMax) && configuredMax > 0
				? configuredMax
				: 3,
			FtpService.SLOT_WAIT_TIMEOUT_MS,
		);
	}

	/** Reads the active provider's credentials from the DB (see FtpProviderConfigService, which caches this for 30s). */
	private async getConfig(): Promise<FtpConfig> {
		const active = await this.ftpProviderConfigService.getActiveConfig();
		return {
			host: active.host,
			port: active.port,
			user: active.user,
			password: active.password,
			secure: active.secure,
			basePath: active.basePath,
		};
	}

	/**
	 * Create and connect a new FTP client while owning one limiter slot until the
	 * caller closes the client. Prefer createSession/withSession for ETL work.
	 */
	async connect(context = 'ftp'): Promise<ftp.Client> {
		const releaseSlot = await this.connectionLimiter.acquire(context);
		try {
			const client = await this.connectClient();
			const close = client.close.bind(client);
			let released = false;
			client.close = () => {
				if (!released) {
					released = true;
					releaseSlot();
				}
				close();
			};
			return client;
		} catch (error) {
			releaseSlot();
			throw error;
		}
	}

	private async connectClient(): Promise<ftp.Client> {
		const config = await this.getConfig();
		const maxAttempts = 3;
		const retryDelayMs = 2000;
		let lastError: Error | undefined;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				this.logger.log(
					`Connecting to FTPS ${config.host}:${config.port}...${attempt > 1 ? ` (attempt ${attempt}/${maxAttempts})` : ''}`,
				);
				const client = await connectFtpClient({
					host: config.host,
					port: config.port,
					user: config.user,
					password: config.password,
					secure: config.secure,
				});
				this.logger.log('FTPS connected successfully');
				return client;
			} catch (err) {
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
	createSession(context = 'ftp'): FtpSession {
		return new FtpSession(
			() => this.connectClient(),
			() => this.connectionLimiter.acquire(context),
		);
	}

	/**
	 * Runs an action against a single leased connection. Every FtpService method
	 * called with the supplied session shares that one login.
	 */
	async withSession<T>(
		action: (session: FtpSession) => Promise<T>,
		context = 'ftp',
	): Promise<T> {
		const session = this.createSession(context);
		try {
			return await action(session);
		} finally {
			session.close();
		}
	}

	/**
	 * Runs a single FTP operation, either on the caller's session or on a
	 * throwaway connection when no session is given. A session whose socket died
	 * mid-op is dropped and the same op is retried on a fresh login.
	 */
	private static readonly SESSION_RETRY_ATTEMPTS = 3;

	private async withSessionRetry<T>(
		session: FtpSession | undefined,
		op: (client: ftp.Client) => Promise<T>,
		context = 'ftp',
	): Promise<T> {
		// A throwaway session rather than a raw connect(): closing the session is
		// what returns the connection slot, so the slot cannot leak on a failure
		// path and the limiter's active count stays honest.
		if (!session) {
			return this.withSession(
				(ownedSession) =>
					this.withSessionRetry(ownedSession, op, context),
				context,
			);
		}

		let lastError: Error | undefined;
		for (
			let attempt = 1;
			attempt <= FtpService.SESSION_RETRY_ATTEMPTS;
			attempt++
		) {
			const client = await session.getClient();
			try {
				return await op(client);
			} catch (error) {
				const err = error as Error;
				if (this.isAuthenticationError(err)) throw err;
				lastError = err;
				if (
					!this.isDisconnected(err) ||
					attempt === FtpService.SESSION_RETRY_ATTEMPTS
				) {
					throw err;
				}
				this.logger.warn(
					`FTP session lost (${err.message}); reconnecting (${attempt}/${FtpService.SESSION_RETRY_ATTEMPTS})`,
				);
				session.invalidate();
			}
		}
		throw lastError;
	}

	/**
	 * List all YYYYMM period folders available on FTPS.
	 * Scans both /root/trends/ and /root/usage/.
	 */
	async listPeriods(session?: FtpSession): Promise<string[]> {
		// All four categories share one login, so without a caller-supplied
		// session this opens its own rather than reconnecting per category.
		if (!session) return this.withSession((own) => this.listPeriods(own));

		const config = await this.getConfig();
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
		const config = await this.getConfig();
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
		const config = await this.getConfig();
		const remotePath = `${config.basePath}/${category}/${period}/${dspFolder}`;

		try {
			if (applyGlobalExcludes) {
				await this.excludePatternService.pinCache();
			}
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
			} finally {
				if (applyGlobalExcludes) {
					this.excludePatternService.unpinCache();
				}
			}
		} catch (err) {
			if (this.isAuthenticationError(err as Error)) throw err;
			if (this.isDisconnected(err as Error)) throw err;
			this.logger.warn(
				`Cannot list files for ${category}/${period}/${dspFolder}: ${err.message}`,
			);
			return [];
		}
	}

	/**
	 * Discovery deliberately bypasses parser-specific selectors, but honours the
	 * global exclude configuration. A configured folder/file must not be added to
	 * the discovery catalog, sample queue, or auto-generated rules. One leased
	 * session traverses every requested category; a dropped socket is reopened by
	 * `withSessionRetry` before the failed operation is retried.
	 */
	async listAllRemoteReportFiles(
		categories: string[],
		minimumPeriods: Record<string, string | undefined> = {},
		session?: FtpSession,
	): Promise<FtpRemoteCategoryFiles[]> {
		if (!session)
			return this.withSession((ownedSession) =>
				this.listAllRemoteReportFiles(
					categories,
					minimumPeriods,
					ownedSession,
				),
			);

		const results: FtpRemoteCategoryFiles[] = [];
		for (const category of categories) {
			results.push(
				await this.listRemoteReportFilesForCategory(
					category,
					minimumPeriods[category],
					session,
				),
			);
		}
		return results;
	}

	private async listRemoteReportFilesForCategory(
		category: string,
		minimumPeriod?: string,
		session?: FtpSession,
	): Promise<FtpRemoteCategoryFiles> {
		const config = await this.getConfig();
		const folders: FtpRemoteFolderFiles[] = [];
		const failedPaths: string[] = [];
		const periodEntries = await this.withSessionRetry(session, (client) =>
			this.listDirectoryWithRetry(
				client,
				`${config.basePath}/${category}`,
				`discovery category ${category}`,
			),
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
				const scan = await this.withSessionRetry(
					session,
					async (client) => {
						const folderEntries = await this.listDirectoryWithRetry(
							client,
							periodPath,
							`discovery period ${category}/${periodEntry.name}`,
						);
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

	async downloadDiscoverySampleFile(
		category: string,
		period: string,
		dspFolder: string,
		relativePath: string,
		localPath: string,
		session?: FtpSession,
	): Promise<void> {
		const config = await this.getConfig();
		fs.mkdirSync(path.dirname(localPath), { recursive: true });
		await this.withSessionRetry(session, (client) =>
			client.downloadTo(
				localPath,
				`${config.basePath}/${category}/${period}/${dspFolder}/${relativePath}`,
			),
		);
	}

	private isDisconnected(error: Error): boolean {
		return isFtpDisconnectError(error);
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
				if (this.isCompleteLocalCopy(localItemPath, item.size)) {
					this.logger.log(
						`  ⏭️ ${relativeName} already downloaded (${item.size} bytes), skipping`,
					);
					fileCount++;
					continue;
				}
				try {
					this.logger.log(
						`  ⬇️ ${relativeName}${item.size ? ` (${item.size} bytes)` : ''}`,
					);
					await client.downloadTo(localItemPath, remoteItemPath);
					await this.keepControlConnectionAlive(client);
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
					// A dead socket cannot finish the rest of the folder. Bubble up
					// so withSessionRetry reconnects and re-downloads this DSP
					// instead of skipping remaining files and moving on.
					if (this.isDisconnected(err as Error)) throw err;
					this.logger.error(
						`Failed to download ${remoteItemPath}: ${err.message}`,
					);
				}
			}
		}

		return fileCount;
	}

	/** Skip a re-download when a previous attempt already wrote the full file. */
	private isCompleteLocalCopy(localPath: string, remoteSize: number): boolean {
		if (!remoteSize || remoteSize <= 0) return false;
		try {
			if (!fs.existsSync(localPath)) return false;
			return fs.statSync(localPath).size === remoteSize;
		} catch {
			return false;
		}
	}

	/** Cheap control-channel traffic so Merlin does not FIN mid-folder. */
	private async keepControlConnectionAlive(client: ftp.Client): Promise<void> {
		try {
			if (typeof client.sendIgnoringError === 'function') {
				await client.sendIgnoringError('NOOP');
			}
		} catch {
			// A failed NOOP is not fatal; the next transfer will surface a dead socket.
		}
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
		const config = await this.getConfig();
		const remotePath = `${config.basePath}/${category}/${period}/${dspFolder}`;
		const localPath = path.join(tempDir, period, category, dspFolder);

		this.logger.log(`Downloading ${category}/${period}/${dspFolder} from FTP`);
		await this.excludePatternService.pinCache();
		try {
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
		} finally {
			this.excludePatternService.unpinCache();
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
			const config = await this.getConfig();
			// close() in a finally: without it a failing list() would leak the
			// connection slot it holds and shrink the pool for good.
			const client = await this.connect('test-connection');
			try {
				const list = await client.list(config.basePath);
				const items = list.map((f) => ({
					name: f.name,
					type: f.type,
					isDirectory: f.isDirectory,
					isFile: f.isFile,
					size: f.size,
				}));
				return { ok: true, basePath: config.basePath, items };
			} finally {
				client.close();
			}
		} catch (err) {
			return { ok: false, error: err.message };
		}
	}
}
