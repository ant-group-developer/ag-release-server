// src/modules/distribution2/sftp/sftp.service.ts
import {
	DeleteObjectCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Injectable, Logger } from '@nestjs/common';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import SftpClient, { FileInfo } from 'ssh2-sftp-client';
import { Readable } from 'stream';
import {
	SftpMetadata,
	StorageType,
} from '../sftp-configs/type/sftp-config.type';

@Injectable()
export class SftpConnectService {
	private readonly logger = new Logger(SftpConnectService.name);
	private readonly s3UploadTimeoutMs = 60 * 60 * 1000;

	private createClient(): SftpClient {
		return new SftpClient();
	}

	private getConnectConfig(config: SftpMetadata) {
		return {
			host: config.host,
			port: config.port ?? 22,
			username: config.username,
			password: config.password,
			privateKey: config.privateKey,
			readyTimeout: 60_000,
			keepaliveInterval: 20_000, // 20 seconds keepalive
			keepaliveCountMax: 3, // 3 missed keepalives before disconnect
		};
	}

	private uploadFileWithTimeout(
		client: SftpClient,
		localPath: string,
		remotePath: string,
		onFileUploaded?: (file: string) => void,
	): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			let timer: NodeJS.Timeout;
			const fileName = path.basename(localPath);
			const stats = fs.statSync(localPath);
			const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

			this.logger.log(
				`Bắt đầu tải lên SFTP: ${fileName} (${fileSizeMB} MB)`,
			);

			const resetTimeout = () => {
				if (timer) clearTimeout(timer);
				timer = setTimeout(
					() => {
						reject(
							new Error(
								`SFTP upload timeout: Quá 5 phút không có dữ liệu mới được tải lên cho file ${fileName}`,
							),
						);
					},
					5 * 60 * 1000,
				); // 5 minutes inactivity timeout
			};

			resetTimeout();

			let lastTransferred = 0;
			client
				.put(localPath, remotePath, {
					step: (
						total_transferred: number,
						chunk: number,
						total_size: number,
					) => {
						resetTimeout();
						const percent =
							total_size > 0
								? (
										(total_transferred / total_size) *
										100
									).toFixed(1)
								: '0';
						if (
							total_transferred - lastTransferred >
								5 * 1024 * 1024 ||
							total_transferred === total_size
						) {
							this.logger.log(
								`Tiến trình tải lên [${fileName}]: ${percent}% (${(
									total_transferred /
									(1024 * 1024)
								).toFixed(2)} MB / ${fileSizeMB} MB)`,
							);
							lastTransferred = total_transferred;
						}
					},
				})
				.then(() => {
					if (timer) clearTimeout(timer);
					this.logger.log(`Tải lên SFTP thành công: ${fileName}`);
					onFileUploaded?.(localPath);
					resolve();
				})
				.catch((err) => {
					if (timer) clearTimeout(timer);
					this.logger.error(
						`Lỗi khi tải file ${fileName} lên SFTP: ${err.message}`,
						err.stack,
					);
					reject(err instanceof Error ? err : new Error(String(err)));
				});
		});
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
					requestHandler: new NodeHttpHandler({
						connectionTimeout: 10000,
						socketTimeout: 10000,
					}),
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
				} catch {
					// Ignore deletion errors for test file
				}

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
		(client as any).on('error', (err: any) => {
			this.logger.error(
				`SFTP Client Error (testConnect): ${err.message}`,
				err.stack,
			);
		});

		try {
			await client.connect(this.getConnectConfig(config));

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
		(client as any).on('error', (err: any) => {
			this.logger.error(
				`SFTP Client Error (connect): ${err.message}`,
				err.stack,
			);
		});

		await client.connect(this.getConnectConfig(config));

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
		(client as any).on('error', (err: any) => {
			this.logger.error(
				`SFTP Client Error (listDirect): ${err.message}`,
				err.stack,
			);
		});

		try {
			await client.connect(this.getConnectConfig(config));

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
			const fileStream = fs.createReadStream(localFile);

			try {
				const upload = new Upload({
					client: s3,
					params: {
						Bucket: sftp.bucket!,
						Key: key,
						Body: fileStream,
					},
					leavePartsOnError: false,
					queueSize: 4,
					partSize: 10 * 1024 * 1024,
				});
				await upload.done();
			} finally {
				fileStream.destroy();
			}
			return;
		}

		const client = new SftpClient();
		(client as any).on('error', (err: any) => {
			this.logger.error(
				`SFTP Client Error (uploadFile): ${err.message}`,
				err.stack,
			);
		});
		try {
			await client.connect(this.getConnectConfig(sftp));

			try {
				await client.mkdir(remoteDir, true);
			} catch (e: any) {
				if (e.code !== 4) throw e;
			}

			const remotePath = path.posix.join(
				remoteDir,
				path.basename(localFile),
			);
			await this.uploadFileWithTimeout(client, localFile, remotePath);
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

		// ai có tâm thì sửa lại chỗ build dir trên remote
		if (sftp.type === StorageType.S3) {
			const s3 = this.createS3Client(sftp);

			const current = path.basename(localDir); // 20260603164430404
			const _parent = path.basename(path.dirname(localDir)); // release_parsed (bỏ qua)

			// Lấy UPC folders bên trong localDir
			const upcFolders = fs.readdirSync(localDir);

			for (const upc of upcFolders) {
				const targetRemoteDir = path.posix.join('/', current, upc);
				const localUpcDir = path.join(localDir, upc);

				await this.uploadFolderS3Recursive(
					s3,
					sftp,
					localUpcDir,
					targetRemoteDir,
				);
			}
			return;
		}

		const client = new SftpClient();
		(client as any).on('error', (err: any) => {
			this.logger.error(
				`SFTP Client Error (uploadFolder): ${err.message}`,
				err.stack,
			);
		});
		try {
			await client.connect(this.getConnectConfig(sftp));

			const targetRemoteDir = path.posix.join(
				remoteDir,
				path.basename(localDir),
			);

			await this.uploadRecursive(client, localDir, targetRemoteDir);
		} finally {
			await client.end();
		}
	}

	// hàm tìm file trong feed/antmusic/20260603164430404/885123456789/
	async getVevoResponse({
		sftp,
		batchId,
		releaseReference,
	}: {
		sftp: SftpMetadata;
		batchId: string;
		releaseReference: string;
	}): Promise<{
		status: 'success' | 'failure';
		key: string;
		content: unknown;
	} | null> {
		if (sftp.type !== StorageType.S3) {
			throw new Error('Vevo response lookup requires S3 storage');
		}

		if (!sftp.bucket) {
			throw new Error('Missing S3 bucket for Vevo response lookup');
		}

		const s3 = this.createS3Client(sftp);
		const prefix = this.buildS3Key(sftp.path, batchId, releaseReference);
		const result = await s3.send(
			new ListObjectsV2Command({
				Bucket: sftp.bucket,
				Prefix: `${prefix}/`,
			}),
		);

		const responseObject =
			result.Contents?.find((item) =>
				this.isVevoResponseFile(item.Key, 'failure'),
			) ??
			result.Contents?.find((item) =>
				this.isVevoResponseFile(item.Key, 'success'),
			);

		if (!responseObject?.Key) return null;

		const file = await s3.send(
			new GetObjectCommand({
				Bucket: sftp.bucket,
				Key: responseObject.Key,
			}),
		);
		const contentText = await this.readS3Body(file.Body);
		let content: unknown = contentText;

		try {
			content = JSON.parse(contentText);
		} catch {
			// Ignore JSON parsing errors and use raw content text
		}

		return {
			status: this.getVevoResponseStatus(responseObject.Key),
			key: responseObject.Key,
			content,
		};
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
				await this.uploadFileWithTimeout(
					client,
					lp,
					rp,
					onFileUploaded,
				);
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
			requestHandler: new NodeHttpHandler({
				connectionTimeout: 60000, // 1 phút để thiết lập kết nối mạng ban đầu
				socketTimeout: 300000, // 5 phút không có gói tin nào truyền nhận qua socket thì ngắt và báo lỗi
			}),
		});
	}

	private async readS3Body(body: unknown): Promise<string> {
		if (!body) return '';

		const stream = body as Readable;
		const chunks: Buffer[] = [];

		for await (const chunk of stream) {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		}

		return Buffer.concat(chunks).toString('utf-8');
	}

	private isVevoResponseFile(
		key: string | undefined,
		status: 'success' | 'failure',
	): boolean {
		const fileName = path.posix.basename(key ?? '').toLowerCase();
		if (!fileName.endsWith('.json')) return false;

		if (status === 'success') {
			return fileName.startsWith('success');
		}

		return fileName.startsWith('failure') || fileName.startsWith('fail');
	}

	private getVevoResponseStatus(key: string): 'success' | 'failure' {
		return this.isVevoResponseFile(key, 'success') ? 'success' : 'failure';
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
		const entries = fs.readdirSync(localDir, { withFileTypes: true });
		const sorted = [
			...entries.filter((e) => e.isDirectory()),
			...entries.filter((e) => e.isFile() && !e.name.endsWith('.xml')),
			...entries.filter((e) => e.isFile() && e.name.endsWith('.xml')),
		];

		for (const entry of sorted) {
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
				const stats = fs.statSync(localPath);
<<<<<<< HEAD
<<<<<<< HEAD
=======
				const abortController = new AbortController();
>>>>>>> a6ba3166 (update (uploadFolderS3): fix out of memory)
=======
>>>>>>> 36754eaf (update (uploadFolderS3): handle multipart upload to fix out of memory)
				const fileStream = fs.createReadStream(localPath);
				let parallelUploads3: Upload | null = null;
				const timeout = setTimeout(() => {
					this.logger.error(
						`S3 upload timed out after 1 hour: ${key}`,
					);
<<<<<<< HEAD
					abortController.abort();
=======
					if (parallelUploads3) {
						parallelUploads3.abort();
					}
					fileStream.destroy();
>>>>>>> 36754eaf (update (uploadFolderS3): handle multipart upload to fix out of memory)
				}, this.s3UploadTimeoutMs);

				this.logger.log(`file size ${stats.size}`);
				this.logger.log(`Starting S3 upload: ${key}`);

				try {
					parallelUploads3 = new Upload({
						client: s3,
						params: {
							Bucket: config.bucket!,
							Key: key,
							Body: fileStream,
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 36754eaf (update (uploadFolderS3): handle multipart upload to fix out of memory)
						},
						leavePartsOnError: false,
						queueSize: 4, // Upload song song tối đa 4 part cùng lúc
						partSize: 10 * 1024 * 1024, // Chia nhỏ 10MB mỗi part
					});

					await parallelUploads3.done();
<<<<<<< HEAD
=======
							ContentLength: stats.size, // <--- Báo kích thước file để không nạp đệm toàn bộ vào RAM
						}),
						{ abortSignal: abortController.signal },
					);
>>>>>>> a6ba3166 (update (uploadFolderS3): fix out of memory)
=======
>>>>>>> 36754eaf (update (uploadFolderS3): handle multipart upload to fix out of memory)
					this.logger.log(`Completed S3 upload: ${key}`);
				} catch (error) {
					this.logger.error(
						`S3 upload failed: ${key}`,
						error instanceof Error ? error.stack : String(error),
					);
					throw error;
				} finally {
					clearTimeout(timeout);
					fileStream.destroy();
				}
			}
		}
	}
}
