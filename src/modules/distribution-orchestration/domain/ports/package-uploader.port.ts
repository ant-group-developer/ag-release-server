import { DspCode } from '../value-objects/dsp-code.vo';
import { IdempotencyKey } from '../value-objects/idempotency-key.vo';
import { PackagePath } from '../value-objects/package-path.vo';

export interface UploadResult {
	readonly ok: boolean;
	readonly bytesSent?: number;
}

/**
 * PackageUploader — uploads one package to one host (SFTP bulkhead per host in the adapter).
 * Idempotent by checksum. For VIA_AGGREGATOR: upload folder + create .done = ALREADY imported
 * (there is no separate "import" step — see spec §5).
 */
export interface PackageUploader {
	upload(input: {
		path: PackagePath;
		dspCode: DspCode;
		key: IdempotencyKey;
		/**
		 * Khi set: resolve SFTP config theo AGGREGATOR code này (CI cluster upload 1 lần cả cụm),
		 * KHÔNG theo dspCode. dspCode lúc này là aggregator code (không phải 1 DSP thật) → resolve
		 * theo dsp.code sẽ NOT_FOUND. Bỏ trống = resolve per-DSP như cũ (direct / legacy per-DSP).
		 */
		aggregatorCode?: string;
	}): Promise<UploadResult>;
	markBatchDone(input: {
		path: PackagePath;
		dspCode: DspCode;
		key: IdempotencyKey;
		aggregatorCode?: string;
	}): Promise<void>;
}
