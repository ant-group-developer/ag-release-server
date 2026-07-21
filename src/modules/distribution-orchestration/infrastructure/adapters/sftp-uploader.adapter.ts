import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { DspRoutingConfigsService } from '../../../distribution/dsp-routing/services/dsp-routing-config.service';
import { SftpConnectService } from '../../../distribution/sftp-connect/sftp-connect.service';
import {
	PackageUploader,
	UploadResult,
} from '../../domain/ports/package-uploader.port';
import { DspCode } from '../../domain/value-objects/dsp-code.vo';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';
import { PackagePath } from '../../domain/value-objects/package-path.vo';

/**
 * SftpUploaderAdapter — uploads DDEX packages via SFTP/S3.
 *
 * Wraps v3 SftpConnectService behind the PackageUploader domain port.
 * Resolves SFTP config per DSP via DspRoutingConfigsService.
 *
 * Upload flow:
 *   1. Resolve SftpMetadata from DspRoutingConfigsService
 *   2. Map PackagePath → local filesystem path
 *   3. Call SftpConnectService.uploadFolder()
 *
 * markBatchDone flow (VIA_AGGREGATOR only):
 *   1. Create empty .done temp file
 *   2. Upload via SftpConnectService.uploadFile()
 *
 * Idempotency: path-based (folder timestamp unique via genBatchId).
 */
@Injectable()
export class SftpUploaderAdapter implements PackageUploader {
	private readonly logger = new Logger(SftpUploaderAdapter.name);
	private readonly baseDir: string;

	constructor(
		private readonly sftpService: SftpConnectService,
		private readonly dspRoutingService: DspRoutingConfigsService,
	) {
		this.baseDir =
			process.env.RELEASE_PARSED_DIR || path.resolve('release_parsed');
	}

	async upload(input: {
		path: PackagePath;
		dspCode: DspCode;
		key: IdempotencyKey;
	}): Promise<UploadResult> {
		const { path: packagePath, dspCode, key } = input;
		this.logger.log(
			`[upload] path=${packagePath.key} dspCode=${dspCode.value} key=${key.value}`,
		);

		// 1. Resolve SFTP/S3 config for this DSP
		const config = await this.dspRoutingService.resolveFullDeliveryConfig(
			dspCode.value,
		);

		// 2. Map PackagePath → local dir
		// packagePath.key = '{batchId}/{releaseReference}' — parent dir = batchId
		const batchDir = path.join(this.baseDir, packagePath.key.split('/')[0]);
		const localDir = path.join(this.baseDir, packagePath.key);

		if (!fs.existsSync(localDir)) {
			throw new Error(
				`SftpUploaderAdapter: local dir not found: ${localDir}`,
			);
		}

		// 3. Upload — use batchDir (parent) so uploadFolder sends the full structure
		const remoteDir = config.sftp.path || '/';

		this.logger.log(
			`[upload] localDir=${batchDir} remoteDir=${remoteDir} type=${config.sftp.type ?? 'sftp'}`,
		);

		await this.sftpService.uploadFolder({
			sftp: config.sftp,
			localDir: batchDir,
			remoteDir,
		});

		this.logger.log(`[upload] Upload complete for ${dspCode.value}`);
		return { ok: true };
	}

	async markBatchDone(input: {
		path: PackagePath;
		dspCode: DspCode;
		key: IdempotencyKey;
	}): Promise<void> {
		const { path: packagePath, dspCode, key } = input;
		this.logger.log(
			`[markBatchDone] path=${packagePath.key} dspCode=${dspCode.value}`,
		);

		// 1. Resolve SFTP config
		const config = await this.dspRoutingService.resolveFullDeliveryConfig(
			dspCode.value,
		);

		if (!config.createsDoneFolder) {
			this.logger.log(
				`[markBatchDone] createsDoneFolder=false for ${dspCode.value}, skip`,
			);
			return;
		}

		// 2. Extract batchId from path
		const batchId = packagePath.key.split('/')[0];

		// 3. Create temp .done file
		const tempDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), `done-${batchId.slice(0, 8)}-`),
		);
		const doneFileName = `BatchComplete_${batchId}.done`;
		const doneFilePath = path.join(tempDir, doneFileName);

		try {
			// Write empty .done marker file
			fs.writeFileSync(doneFilePath, '', 'utf-8');

			// 4. Upload .done file to remote
			const remoteDir = config.sftp.path || '/';

			await this.sftpService.uploadFile({
				sftp: config.sftp,
				localFile: doneFilePath,
				remoteDir,
			});

			this.logger.log(
				`[markBatchDone] Done file uploaded: ${doneFileName}`,
			);
		} finally {
			// Clean up temp dir
			fs.promises
				.rm(tempDir, { recursive: true, force: true })
				.catch(() => {});
		}
	}
}
