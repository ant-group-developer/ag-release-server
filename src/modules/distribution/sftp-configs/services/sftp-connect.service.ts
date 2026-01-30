// src/modules/distribution2/sftp/sftp.service.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import SftpClient from 'ssh2-sftp-client';

@Injectable()
export class SftpConnectService implements OnModuleDestroy {
	// public
	/**
	 * List directory items. If path not provided, uses SFTP_BASE_DIR.
	 */
	async list(remotePath?: string) {
		await this.connectIfNeeded();

		const sftp = this.client();
		const p = (remotePath?.trim() || this.baseDir).trim();

		const items = await sftp.list(p);
		return { baseDir: this.baseDir, path: p, items };
	}

	// ======================================================
	// Upload folder từ Local lên SFTP (đệ quy)
	// ======================================================

	/**
	 * Upload toàn bộ thư mục từ local lên SFTP, giữ nguyên cấu trúc thư mục.
	 * - localDir: Thư mục local cần upload.
	 * - remoteDir: Thư mục đích trên SFTP.
	 */
	async uploadFolder(localDir: string, remoteDir: string = '/') {
		await this.connectIfNeeded();

		const sftp = this.client();

		// Đảm bảo thư mục remote trên SFTP đã tồn tại
		await this.ensureRemoteDir(sftp, remoteDir);

		// Upload đệ quy các file và thư mục con
		await this.uploadDirRecursive(sftp, localDir, remoteDir);
	}

	// private
	private readonly logger = new Logger(SftpService.name);

	private sftp: SftpClient | null = null;
	private isConnected = false;

	constructor(private readonly config: ConfigService) {}
	async onModuleDestroy() {
		await this.disconnect();
	}

	private get baseDir(): string {
		return (this.config.get<string>('SFTP_BASE_DIR') || '/').trim() || '/';
	}

	private buildConfig() {
		const host = this.config.get<string>('SFTP_HOST');
		const username = this.config.get<string>('SFTP_USERNAME');

		if (!host) throw new Error('Missing env: SFTP_HOST');
		if (!username) throw new Error('Missing env: SFTP_USERNAME');

		const port = Number(this.config.get<string>('SFTP_PORT') || '22');
		const password = this.config.get<string>('SFTP_PASSWORD') || undefined;

		// Cho phép auth bằng password hoặc privateKey
		if (!password) {
			throw new Error(
				'Missing auth env: set SFTP_PASSWORD or SFTP_PRIVATE_KEY_PATH',
			);
		}

		return {
			host,
			port,
			username,
			password,
		};
	}

	private client(): SftpClient {
		if (!this.sftp || !this.isConnected)
			throw new Error('SFTP_NOT_CONNECTED');
		return this.sftp;
	}

	async connectIfNeeded() {
		if (this.isConnected && this.sftp) return;

		const cfg = this.buildConfig();

		this.sftp = new SftpClient();
		await this.sftp.connect(cfg);
		this.isConnected = true;

		this.logger.log(
			`[SFTP_CONNECTED] ${cfg.username}@${cfg.host}:${cfg.port}`,
		);
	}

	async disconnect() {
		if (!this.sftp || !this.isConnected) return;

		try {
			await this.sftp.end();
		} finally {
			this.sftp = null;
			this.isConnected = false;
			this.logger.log('[SFTP_DISCONNECTED]');
		}
	}

	/**
	 * Đảm bảo thư mục remote trên SFTP đã tồn tại.
	 * Nếu chưa, tạo mới (đệ quy).
	 */
	private async ensureRemoteDir(sftp: SftpClient, remoteDir: string) {
		const exists = await sftp.exists(remoteDir);
		if (exists === 'd') return;
		await sftp.mkdir(remoteDir, true); // tạo thư mục đệ quy
	}

	/**
	 * Đệ quy qua tất cả các file trong thư mục local và upload lên SFTP.
	 * - localDir: Thư mục local.
	 * - remoteDir: Thư mục đích trên SFTP.
	 */
	private async uploadDirRecursive(
		sftp: SftpClient,
		localDir: string,
		remoteDir: string,
	) {
		const entries = fs.readdirSync(localDir, { withFileTypes: true });

		for (const entry of entries) {
			const localPath = path.join(localDir, entry.name);
			const remotePath = path.posix.join(remoteDir, entry.name); // sử dụng path.posix để đảm bảo đúng SFTP

			if (entry.isDirectory()) {
				// Nếu là thư mục, đệ quy tạo thư mục và upload nội dung bên trong
				await this.ensureRemoteDir(sftp, remotePath);
				await this.uploadDirRecursive(sftp, localPath, remotePath);
				continue;
			}

			if (entry.isFile()) {
				// Nếu là file, upload lên SFTP
				await sftp.put(localPath, remotePath);
			}
		}
	}
}
