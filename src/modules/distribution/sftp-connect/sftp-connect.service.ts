// src/modules/distribution2/sftp/sftp.service.ts
import {
	DeleteObjectCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import SftpClient, { FileInfo } from 'ssh2-sftp-client';
import {
	SftpMetadata,
	StorageType,
} from '../sftp-configs/type/sftp-config.type';

@Injectable()
export class SftpConnectService {
	private readonly logger = new Logger(SftpConnectService.name);

	private createClient(): SftpClient {
		return new SftpClient();
	}

	async testConnect(config: SftpMetadata): Promise<{
		status: boolean;
		latencyMs?: number;
		error?: any;
	}> {
		const start = Date.now();

		if (config.type === StorageType.S3) {
			try {
				const s3 = new S3Client({
					region: config.region || 'us-east-1',
					credentials: {
						accessKeyId: config.accessKeyId!,
						secretAccessKey: config.secretAccessKey!,
					},
					endpoint: config.endpoint,
					forcePathStyle: !!config.endpoint,
				});

				const testKey =
					`${config.path || ''}/_connection_test_${Date.now()}.txt`
						.replace(/^\/+/, '')
						.replace(/\/+/g, '/');

				await s3.send(
					new PutObjectCommand({
						Bucket: config.bucket!,
						Key: testKey,
						Body: Buffer.from('connection test'),
						ContentType: 'text/plain',
					}),
				);

				// Có thể không có quyền delete
				try {
					await s3.send(
						new DeleteObjectCommand({
							Bucket: config.bucket!,
							Key: testKey,
						}),
					);
				} catch {}

				return {
					status: true,
					latencyMs: Date.now() - start,
				};
			} catch (err: any) {
				this.logger.error('S3 testConnect failed', err);

				return {
					status: false,
					error:
						err?.message || err?.Code || err?.name || String(err),
				};
			}
		}

		const client = this.createClient();

		try {
			await client.connect({
				host: config.host,
				port: config.port ?? 22,
				username: config.username,
				password: config.password,
				privateKey: config.privateKey,
				readyTimeout: 60_000,
			});

			await client.list(config.path || '.');

			return {
				status: true,
				latencyMs: Date.now() - start,
			};
		} catch (err: any) {
			this.logger.error('SFTP testConnect failed', err);

			return {
				status: false,
				error: err?.message || err?.code || err?.name || String(err),
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
			readyTimeout: 60_000, // Increased from 10s to 60s
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
				readyTimeout: 60_000, // Increased from 10s to 60s
			});

			return await client.list(remotePath);
		} finally {
			await client.end();
		}
	}

	// async uploadFile({
	// 	sftp,
	// 	localFile,
	// 	remoteDir,
	// }: {
	// 	sftp: {
	// 		host: string;
	// 		port?: number;
	// 		username: string;
	// 		password?: string;
	// 		privateKey?: string | Buffer;
	// 	};
	// 	localFile: string;
	// 	remoteDir: string;
	// }) {
	// 	const client = new SftpClient();

	// 	try {
	// 		if (!fs.statSync(localFile).isFile()) {
	// 			throw new Error('localFile is not a file');
	// 		}

	// 		await client.connect({
	// 			host: sftp.host,
	// 			port: sftp.port ?? 22,
	// 			username: sftp.username,
	// 			password: sftp.password,
	// 			privateKey: sftp.privateKey,
	// 			readyTimeout: 60_000,
	// 		});

	// 		try {
	// 			await client.mkdir(remoteDir, true);
	// 		} catch (e: any) {
	// 			if (e.code !== 4) throw e;
	// 		}

	// 		const remotePath = path.posix.join(
	// 			remoteDir,
	// 			path.basename(localFile),
	// 		);

	// 		await client.put(localFile, remotePath);
	// 	} finally {
	// 		await client.end();
	// 	}
	// }

	async uploadFile({
		sftp,
		localFile,
		remoteDir,
	}: {
		sftp: SftpMetadata;
		localFile: string;
		remoteDir: string;
	}) {
		if (!fs.statSync(localFile).isFile()) {
			throw new Error('localFile is not a file');
		}

		if (sftp.type === StorageType.S3) {
			const s3 = this.createS3Client(sftp);
			const key = this.buildS3Key(
				sftp.path,
				remoteDir,
				path.basename(localFile),
			);

			await s3.send(
				new PutObjectCommand({
					Bucket: sftp.bucket!,
					Key: key,
					Body: fs.createReadStream(localFile),
				}),
			);

			return;
		}

		const client = new SftpClient();
		try {
			await client.connect({
				host: sftp.host,
				port: sftp.port ?? 22,
				username: sftp.username,
				password: sftp.password,
				privateKey: sftp.privateKey,
				readyTimeout: 60_000,
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

	// async uploadFolder({
	// 	sftp,
	// 	localDir,
	// 	remoteDir,
	// }: {
	// 	sftp: {
	// 		host: string;
	// 		port?: number;
	// 		username: string;
	// 		password?: string;
	// 		privateKey?: string | Buffer;
	// 	};
	// 	localDir: string;
	// 	remoteDir: string;
	// }) {
	// 	const client = new SftpClient();

	// 	try {
	// 		if (!fs.statSync(localDir).isDirectory()) {
	// 			throw new Error('localDir is not a directory');
	// 		}

	// 		await client.connect({
	// 			host: sftp.host,
	// 			port: sftp.port ?? 22,
	// 			username: sftp.username,
	// 			password: sftp.password,
	// 			privateKey: sftp.privateKey,
	// 			readyTimeout: 60_000,
	// 		});

	// 		// Lấy tên thư mục cần upload
	// 		const folderName = path.basename(localDir);
	// 		// Tạo đường dẫn remote mới bao gồm tên thư mục
	// 		const targetRemoteDir = path.posix.join(remoteDir, folderName);

	// 		await this.uploadRecursive(client, localDir, targetRemoteDir);
	// 	} finally {
	// 		await client.end();
	// 	}
	// }

	async uploadFolder({
		sftp,
		localDir,
		remoteDir,
	}: {
		sftp: SftpMetadata;
		localDir: string;
		remoteDir: string;
	}) {
		if (!fs.statSync(localDir).isDirectory()) {
			throw new Error('localDir is not a directory');
		}

		if (sftp.type === StorageType.S3) {
			const s3 = this.createS3Client(sftp);
			await this.uploadFolderS3Recursive(s3, sftp, localDir, remoteDir);
			return;
		}

		const client = new SftpClient();
		try {
			await client.connect({
				host: sftp.host,
				port: sftp.port ?? 22,
				username: sftp.username,
				password: sftp.password,
				privateKey: sftp.privateKey,
				readyTimeout: 60_000,
			});

			const targetRemoteDir = path.posix.join(
				remoteDir,
				path.basename(localDir),
			);
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
			privateKey?: string | Buffer;
		};
		localDir: string;
		remoteDir: string;
		timeoutMs?: number;
	}) {
		const port = sftp.port ?? 22;

		if (!sftp.host) throw new Error('Missing sftp.host');
		if (!sftp.username) throw new Error('Missing sftp.username');
		if (!sftp.password && !sftp.privateKey)
			throw new Error('Missing sftp.password or sftp.privateKey');
		if (!localDir) throw new Error('Missing localDir');

		let tempKeyPath: string | null = null;

		return new Promise<string>((resolve, reject) => {
			let command: string;
			let args: string[];

			const scpArgs = [
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
				`${sftp.username}@${sftp.host}:${remoteDir || ''}`,
			];

			if (sftp.privateKey) {
				const cleanKey =
					typeof sftp.privateKey === 'string'
						? sftp.privateKey
								.replace(/\\n/g, '\n')
								.replace(/\r/g, '')
								.trim() + '\n'
						: sftp.privateKey;

				tempKeyPath = path.join(os.tmpdir(), `sftp_key_${Date.now()}`);
				fs.writeFileSync(tempKeyPath, cleanKey, {
					mode: 0o600,
				});

				command = 'scp';
				args = ['-i', tempKeyPath, ...scpArgs];
			} else {
				command = 'sshpass';
				args = ['-p', sftp.password!, 'scp', ...scpArgs];
			}

			const scp = spawn(command, args, {
				stdio: ['ignore', 'pipe', 'pipe'],
			});

			let stdout = '';
			let stderr = '';
			let done = false;

			const cleanup = () => {
				if (tempKeyPath && fs.existsSync(tempKeyPath)) {
					fs.unlinkSync(tempKeyPath);
				}
			};

			const finish = (error?: Error, result?: string) => {
				if (done) return;
				done = true;
				clearTimeout(timer);
				cleanup();
				if (error) reject(error);
				else resolve(result ?? stdout);
			};

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
						`Failed to start scp: ${err.message}\nstdout: ${stdout}\nstderr: ${stderr}`,
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

	private createS3Client(config: SftpMetadata): S3Client {
		return new S3Client({
			region: config.region || 'us-east-1',
			credentials: {
				accessKeyId: config.accessKeyId!,
				secretAccessKey: config.secretAccessKey!,
			},
			endpoint: config.endpoint,
			forcePathStyle: !!config.endpoint,
		});
	}

	private buildS3Key(...parts: (string | undefined)[]): string {
		return parts
			.filter(Boolean)
			.join('/')
			.replace(/\/+/g, '/')
			.replace(/^\/+/, '');
	}

	private async uploadFolderS3Recursive(
		s3: S3Client,
		config: SftpMetadata,
		localDir: string,
		remoteDir: string,
	) {
		for (const entry of fs.readdirSync(localDir, { withFileTypes: true })) {
			if (entry.isSymbolicLink()) continue;

			const localPath = path.join(localDir, entry.name);
			const remotePath = path.posix.join(remoteDir, entry.name);

			if (entry.isDirectory()) {
				await this.uploadFolderS3Recursive(
					s3,
					config,
					localPath,
					remotePath,
				);
			} else if (entry.isFile()) {
				const key = this.buildS3Key(config.path, remotePath);

				await s3.send(
					new PutObjectCommand({
						Bucket: config.bucket!,
						Key: key,
						Body: fs.createReadStream(localPath),
					}),
				);
			}
		}
	}
}
