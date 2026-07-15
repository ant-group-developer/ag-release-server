import { InvariantViolationError } from '../errors/domain-errors';

/**
 * PackagePath — a pointer to an already-built package on GCS/S3.
 * Holds NO file bytes, only `bucket` + `key` (+ optional `checksum` for idempotent verification).
 * `key` follows the v3 convention: a `YYYYMMDDHHmmssSSS/...` folder.
 */
export class PackagePath {
	private constructor(
		public readonly bucket: string,
		public readonly key: string,
		public readonly checksum?: string,
	) {}

	static create(bucket: string, key: string, checksum?: string): PackagePath {
		if (!bucket.trim()) {
			throw new InvariantViolationError('PackagePath', 'empty bucket');
		}
		// key: a valid path/folder name (letters, digits, _ - . /)
		if (!/^[\w\-./]+$/.test(key)) {
			throw new InvariantViolationError('PackagePath', `bad key: ${key}`);
		}
		return new PackagePath(bucket.trim(), key, checksum);
	}

	/** URI as `bucket/key` for logging / passing to adapters. */
	get uri(): string {
		return `${this.bucket}/${this.key}`;
	}

	equals(o: PackagePath): boolean {
		return this.uri === o.uri && this.checksum === o.checksum;
	}
}
