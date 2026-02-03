// src/modules/distribution2/sftp/sftp.service.ts
import { Injectable } from '@nestjs/common';
import SftpClient from 'ssh2-sftp-client';
import { SftpMetadata } from '../type/sftp-config.type';

@Injectable()
export class SftpConnectService {
	async pingWithConfig(cfg: SftpMetadata) {
		const sftp = new SftpClient();
		const start = Date.now();

		try {
			await sftp.connect({
				host: cfg.host,
				port: cfg.port ?? 22,
				username: cfg.username,
				password: cfg.password,
				readyTimeout: 5000,
			});

			const latencyMs = Date.now() - start;

			return {
				ok: true,
				latencyMs,
			};
		} catch (err) {
			return {
				ok: false,
				error: err?.message || String(err),
			};
		} finally {
			try {
				await sftp.end();
			} catch {}
		}
	}
}
