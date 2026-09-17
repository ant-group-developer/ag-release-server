import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import SftpClient from 'ssh2-sftp-client';
import {
	DISTRIBUTION_V2_SFTP_CLIENT_FACTORY,
	DistributionV2SftpClient,
	DistributionV2SftpClientFactory,
	DistributionV2SftpTransport,
	SftpUploadInput,
	SftpUploadReceipt,
	SftpUploadReceiptFile,
} from '../../application/ports/sftp-delivery.port';
import { DistributionV2ConfigService } from '../../config/distribution-v2.config.service';

@Injectable()
export class DistributionV2SftpClientFactoryImpl implements DistributionV2SftpClientFactory {
	create(): DistributionV2SftpClient {
		return new SftpClient() as unknown as DistributionV2SftpClient;
	}
}

@Injectable()
export class DistributionV2SftpTransportImpl implements DistributionV2SftpTransport {
	private readonly logger = new Logger(DistributionV2SftpTransportImpl.name);
	private readonly limiters = new Map<string, HostLimiter>();

	constructor(
		private readonly config: DistributionV2ConfigService,
		@Inject(DISTRIBUTION_V2_SFTP_CLIENT_FACTORY)
		private readonly clientFactory: DistributionV2SftpClientFactory,
	) {}

	async upload(input: SftpUploadInput): Promise<SftpUploadReceipt> {
		assertUploadInput(input);
		const hostKey = `${input.connection.host}:${input.connection.port}`;
		const limiter =
			this.limiters.get(hostKey) ??
			this.createLimiter(
				hostKey,
				this.config.getSftpPerHostConcurrency(),
			);

		return limiter.run(() => this.uploadOnce(input));
	}

	private createLimiter(hostKey: string, concurrency: number): HostLimiter {
		const limiter = new HostLimiter(
			concurrency,
			this.config.getSftpRateLimitMs(),
		);
		this.limiters.set(hostKey, limiter);
		return limiter;
	}

	private async uploadOnce(
		input: SftpUploadInput,
	): Promise<SftpUploadReceipt> {
		const client = this.clientFactory.create();
		const orderedFiles = [...input.files].sort(
			(a, b) =>
				filePriority(a.kind) - filePriority(b.kind) ||
				a.path.localeCompare(b.path),
		);
		const marker = orderedFiles
			.slice()
			.reverse()
			.find((file) => file.kind === 'marker');
		if (!marker) throw new Error('SFTP package has no completion marker');

		const remoteBasePath = normalizeRemotePath(input.remoteBasePath);
		const uploaded: SftpUploadReceiptFile[] = [];
		try {
			await withTimeout(
				client.connect({
					host: input.connection.host,
					port: input.connection.port,
					username: input.connection.username,
					password: input.connection.password,
					privateKey: input.connection.privateKey,
					readyTimeout: input.timeoutMs,
					keepaliveInterval: 20_000,
					keepaliveCountMax: 3,
				}),
				input.timeoutMs,
				'SFTP connection',
			);
			await withTimeout(
				client.mkdir(remoteBasePath, true),
				input.timeoutMs,
				'SFTP remote directory creation',
			);

			for (const file of orderedFiles) {
				const localPath = resolvePackageFile(
					input.packageRoot,
					file.path,
				);
				const local = await inspectLocalFile(localPath);
				if (local.size !== file.size || local.sha256 !== file.sha256) {
					throw new Error(
						`package checksum mismatch for ${file.path}: expected ${file.sha256}/${file.size}, got ${local.sha256}/${local.size}`,
					);
				}
				const remotePath = path.posix.join(
					remoteBasePath,
					...file.path.split('/'),
				);
				await withTimeout(
					client.mkdir(path.posix.dirname(remotePath), true),
					input.timeoutMs,
					`SFTP directory ${path.posix.dirname(remotePath)}`,
				);

				let reused = false;
				if (
					await withTimeout(
						client.exists(remotePath),
						input.timeoutMs,
						`SFTP stat ${remotePath}`,
					)
				) {
					try {
						const remoteStat = await withTimeout(
							client.stat(remotePath),
							input.timeoutMs,
							`SFTP stat ${remotePath}`,
						);
						reused = Number(remoteStat.size) === file.size;
					} catch {
						reused = false;
					}
				}
				if (!reused) {
					await withTimeout(
						client.put(localPath, remotePath),
						input.timeoutMs,
						`SFTP upload ${file.path}`,
					);
				}
				uploaded.push({
					path: file.path,
					remotePath,
					size: file.size,
					sha256: file.sha256,
					reused,
				});
			}
			this.logger.debug(
				`Uploaded ${uploaded.length} file(s) to ${input.connection.host} for ${input.idempotencyKey}`,
			);
			return {
				host: input.connection.host,
				remoteBasePath,
				idempotencyKey: input.idempotencyKey,
				files: uploaded,
				markerPath: path.posix.join(remoteBasePath, marker.path),
				uploadedAt: new Date().toISOString(),
			};
		} finally {
			await client.end().catch(() => {
				// The original connection/upload error is more useful to callers.
			});
		}
	}
}

class HostLimiter {
	private active = 0;
	private lastStartedAt = 0;
	private readonly waiters: Array<() => void> = [];

	constructor(
		private readonly concurrency: number,
		private readonly rateLimitMs: number,
	) {
		if (!Number.isInteger(concurrency) || concurrency < 1) {
			throw new Error('SFTP host concurrency must be positive');
		}
	}

	async run<T>(operation: () => Promise<T>): Promise<T> {
		await this.acquire();
		try {
			const waitMs = Math.max(
				0,
				this.rateLimitMs - (Date.now() - this.lastStartedAt),
			);
			if (waitMs > 0) await delay(waitMs);
			this.lastStartedAt = Date.now();
			return await operation();
		} finally {
			this.release();
		}
	}

	private async acquire(): Promise<void> {
		if (this.active < this.concurrency) {
			this.active++;
			return;
		}
		await new Promise<void>((resolve) => this.waiters.push(resolve));
		this.active++;
	}

	private release(): void {
		this.active--;
		this.waiters.shift()?.();
	}
}

function assertUploadInput(input: SftpUploadInput): void {
	if (!input.packageRoot?.trim()) throw new Error('packageRoot is required');
	if (!input.idempotencyKey?.trim()) {
		throw new Error('SFTP idempotencyKey is required');
	}
	if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1_000) {
		throw new Error('SFTP timeoutMs must be at least 1000ms');
	}
	if (!input.connection.host?.trim())
		throw new Error('SFTP host is required');
	if (!input.connection.username?.trim()) {
		throw new Error('SFTP username is required');
	}
	if (!input.files.length) throw new Error('SFTP package has no files');
	for (const file of input.files) {
		validateRelativeFilePath(file.path);
		if (!Number.isSafeInteger(file.size) || file.size < 0) {
			throw new Error(`invalid package size for ${file.path}`);
		}
		if (!/^[a-f0-9]{64}$/.test(file.sha256)) {
			throw new Error(`invalid package checksum for ${file.path}`);
		}
	}
}

function resolvePackageFile(packageRoot: string, relativePath: string): string {
	validateRelativeFilePath(relativePath);
	const root = path.resolve(packageRoot);
	const resolved = path.resolve(root, ...relativePath.split('/'));
	if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
		throw new Error(`package path escapes root: ${relativePath}`);
	}
	return resolved;
}

function validateRelativeFilePath(relativePath: string): void {
	const normalized = relativePath.replace(/\\/g, '/');
	if (
		!normalized ||
		normalized.startsWith('/') ||
		normalized.split('/').some((segment) => !segment || segment === '..')
	) {
		throw new Error(`invalid package file path: ${relativePath}`);
	}
}

function normalizeRemotePath(value: string): string {
	const normalized = `/${value.replace(/\\/g, '/').replace(/^\/+/, '')}`;
	if (normalized.split('/').some((segment) => segment === '..')) {
		throw new Error('remote SFTP path cannot contain parent traversal');
	}
	return normalized.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function filePriority(kind: 'resource' | 'message' | 'marker'): number {
	switch (kind) {
		case 'message':
			return 0;
		case 'resource':
			return 1;
		case 'marker':
			return 2;
	}
}

async function inspectLocalFile(filePath: string): Promise<{
	size: number;
	sha256: string;
}> {
	const stats = await fs.promises.stat(filePath);
	if (!stats.isFile())
		throw new Error(`package path is not a file: ${filePath}`);
	const hash = createHash('sha256');
	const stream = fs.createReadStream(filePath);
	for await (const chunk of stream) {
		hash.update(chunk as Buffer);
	}
	return { size: stats.size, sha256: hash.digest('hex') };
}

async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	operation: string,
): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<T>((_, reject) => {
				timer = setTimeout(
					() =>
						reject(
							new Error(
								`${operation} timed out after ${timeoutMs}ms`,
							),
						),
					timeoutMs,
				);
				timer.unref?.();
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		timer.unref?.();
	});
}
