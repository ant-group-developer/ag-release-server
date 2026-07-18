import {
	PackageUploader,
	UploadResult,
} from '../../domain/ports/package-uploader.port';
import { DspCode } from '../../domain/value-objects/dsp-code.vo';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';
import { PackagePath } from '../../domain/value-objects/package-path.vo';

/**
 * InMemoryPackageUploader — test double cho PackageUploader.
 * Idempotent theo (path, dspCode): upload lại cùng cặp trả kết quả đã lưu, không "gửi" lại.
 * `failNextUpload()` mô phỏng 1 lần lỗi để test retry/backoff.
 */
export class InMemoryPackageUploader implements PackageUploader {
	private readonly resultByKey = new Map<string, UploadResult>();
	private readonly doneBatches = new Set<string>();
	private shouldFailNext = false;

	failNextUpload(): void {
		this.shouldFailNext = true;
	}

	async upload(input: {
		path: PackagePath;
		dspCode: DspCode;
		key: IdempotencyKey;
	}): Promise<UploadResult> {
		const uploadKey = `${input.path.uri}:${input.dspCode.value}`;

		if (this.shouldFailNext) {
			this.shouldFailNext = false;
			return { ok: false };
		}

		const existing = this.resultByKey.get(uploadKey);
		if (existing) return existing;

		const result: UploadResult = { ok: true, bytesSent: 1024 };
		this.resultByKey.set(uploadKey, result);
		return result;
	}

	async markBatchDone(input: {
		path: PackagePath;
		key: IdempotencyKey;
	}): Promise<void> {
		this.doneBatches.add(input.path.uri);
	}

	isBatchDone(path: PackagePath): boolean {
		return this.doneBatches.has(path.uri);
	}
}
