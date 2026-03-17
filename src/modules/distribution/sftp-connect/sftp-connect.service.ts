// src/modules/distribution2/sftp/sftp.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import SftpClient, { FileInfo } from 'ssh2-sftp-client';
import { SftpMetadata } from '../sftp-configs/type/sftp-config.type';

@Injectable()
export class SftpConnectService {
	private readonly logger = new Logger(SftpConnectService.name);

	private createClient(): SftpClient {
		return new SftpClient();
	}

	/**
	 * Test connect only
	 * DÙNG CHO: testConnectById
	 */
	async testConnect(config: SftpMetadata): Promise<{
		status: boolean;
		latencyMs?: number;
		error?: any;
	}> {
		const client = this.createClient();
		const start = Date.now();

		try {
			await client.connect({
				host: config.host,
				port: config.port ?? 22,
				username: config.username,
				password: config.password,
				privateKey: config.privateKey,
				readyTimeout: 10_000,
			});

			// test nhẹ
			await client.list('.');

			return {
				status: true,
				latencyMs: Date.now() - start,
			};
		} catch (err: any) {
			this.logger.error('SFTP testConnect failed', err);
			return {
				status: false,
				error: err?.message || String(err),
			};
		} finally {
			await client.end();
		}
	}

	/**
	 * Connect & return client (manual control)
	 */
	async connect(config: SftpMetadata): Promise<SftpClient> {
		const client = this.createClient();

		await client.connect({
			host: config.host,
			port: config.port ?? 22,
			username: config.username,
			password: config.password,
			privateKey: config.privateKey,
			readyTimeout: 10_000,
		});

		return client;
	}

	/**
	 * List directory
	 */
	async listDirect(
		config: SftpMetadata,
		remotePath: string,
	): Promise<FileInfo[]> {
		const client = this.createClient();

		try {
			await client.connect({
				host: config.host,
				port: config.port ?? 22,
				username: config.username,
				password: config.password,
				privateKey: config.privateKey,
				readyTimeout: 10_000,
			});

			return await client.list(remotePath);
		} finally {
			await client.end();
		}
	}

	async uploadFile({
		sftp,
		localFile,
		remoteDir,
	}: {
		sftp: {
			host: string;
			port?: number;
			username: string;
			password?: string;
			privateKey?: string | Buffer;
		};
		localFile: string;
		remoteDir: string;
	}) {
		const client = new SftpClient();

		try {
			if (!fs.statSync(localFile).isFile()) {
				throw new Error('localFile is not a file');
			}

			await client.connect({
				host: sftp.host,
				port: sftp.port ?? 22,
				username: sftp.username,
				password: sftp.password,
				// privateKey: sftp.privateKey,
			});

			try {
				await client.mkdir(remoteDir, true);
			} catch (e: any) {
				if (e.code !== 4) throw e;
			}

			const remotePath = path.posix.join(
				remoteDir,
				path.basename(localFile),
			);

			await client.put(localFile, remotePath);
		} finally {
			await client.end();
		}
	}

	async uploadFolder({
		sftp,
		localDir,
		remoteDir,
	}: {
		sftp: {
			host: string;
			port?: number;
			username: string;
			password?: string;
			privateKey?: string | Buffer;
		};
		localDir: string;
		remoteDir: string;
	}) {
		const client = new SftpClient();

		try {
			if (!fs.statSync(localDir).isDirectory()) {
				throw new Error('localDir is not a directory');
			}

			await client.connect({
				host: sftp.host,
				port: sftp.port ?? 22,
				username: sftp.username,
				password: sftp.password,
				privateKey: sftp.privateKey,
			});

			// Lấy tên thư mục cần upload
			const folderName = path.basename(localDir);
			// Tạo đường dẫn remote mới bao gồm tên thư mục
			const targetRemoteDir = path.posix.join(remoteDir, folderName);

			await this.uploadRecursive(client, localDir, targetRemoteDir);
		} finally {
			await client.end();
		}
	}

	async uploadFolderScp({
		sftp,
		localDir,
		remoteDir,
		timeoutMs = 60_000 * 60,
	}: {
		sftp: {
			host: string;
			port?: number;
			username: string;
			password?: string;
		};
		localDir: string;
		remoteDir: string;
		timeoutMs?: number;
	}) {
		const port = sftp.port ?? 22;

		if (!sftp.host) throw new Error('Missing sftp.host');
		if (!sftp.username) throw new Error('Missing sftp.username');
		if (!sftp.password) throw new Error('Missing sftp.password');
		if (!localDir) throw new Error('Missing localDir');
		// if (!remoteDir) throw new Error('Missing remoteDir');

		return new Promise<string>((resolve, reject) => {
			const args = [
				'-p',
				sftp.password!,
				'scp',
				'-P',
				String(port),
				'-r',
				'-o',
				'StrictHostKeyChecking=no',
				'-o',
				'UserKnownHostsFile=/dev/null',
				'-o',
				'LogLevel=ERROR',
				localDir,
				`${sftp.username}@${sftp.host}:${remoteDir ?? '\\'}`,
			];

			const scp = spawn('sshpass', args, {
				stdio: ['ignore', 'pipe', 'pipe'],
			});

			let stdout = '';
			let stderr = '';
			let done = false;

			const finish = (error?: Error, result?: string) => {
				if (done) return;
				done = true;
				clearTimeout(timer);
				if (error) reject(error);
				else resolve(result ?? stdout);
			};

			// Timeout để tránh hang vô thời hạn
			const timer = setTimeout(() => {
				scp.kill('SIGKILL');
				finish(new Error(`scp timed out after ${timeoutMs}ms`));
			}, timeoutMs);

			scp.stdout.on('data', (data) => {
				stdout += data.toString();
			});

			scp.stderr.on('data', (data) => {
				stderr += data.toString();
			});

			scp.on('close', (code) => {
				if (code === 0) {
					finish(undefined, stdout);
				} else {
					finish(
						new Error(
							`scp failed with code ${code}\nstdout: ${stdout}\nstderr: ${stderr}`,
						),
					);
				}
			});

			scp.on('error', (err) => {
				finish(
					new Error(
						`Failed to start sshpass/scp: ${err.message}\nstdout: ${stdout}\nstderr: ${stderr}`,
					),
				);
			});
		});
	}

	private async uploadRecursive(
		client: SftpClient,
		localDir: string,
		remoteDir: string,
		onFileUploaded?: (file: string) => void,
	) {
		await client.mkdir(remoteDir, true);

		for (const entry of fs.readdirSync(localDir, { withFileTypes: true })) {
			const lp = path.join(localDir, entry.name);
			const rp = path.posix.join(remoteDir, entry.name);

			if (entry.isSymbolicLink()) continue;

			if (entry.isDirectory()) {
				await this.uploadRecursive(client, lp, rp, onFileUploaded);
			} else if (entry.isFile()) {
				await client.put(lp, rp);
				onFileUploaded?.(lp);
			}
		}
	}
}
