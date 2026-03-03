// src/modules/distribution2/sftp/sftp.service.ts
import { Injectable, Logger } from '@nestjs/common';
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
