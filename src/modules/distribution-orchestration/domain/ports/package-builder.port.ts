import { IdempotencyKey } from '../value-objects/idempotency-key.vo';
import { PackagePath } from '../value-objects/package-path.vo';

/**
 * PackageBuilder — generates DDEX XML + a `YYYYMMDDHHmmssSSS` folder on GCS/S3,
 * returns a pointer (PackagePath). Adapter (phase 4) wraps xmlbuilder2 + object storage.
 */
export interface PackageBuilder {
	build(input: {
		snapshotId: string;
		processCode: string;
		key: IdempotencyKey;
	}): Promise<PackagePath>;
}
