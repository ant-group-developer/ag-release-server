import { IdempotencyKey } from '../value-objects/idempotency-key.vo';
import { Isrc } from '../value-objects/isrc.vo';
import { Upc } from '../value-objects/upc.vo';

/**
 * IdentifierProvisioner — provisions UPC/ISRC via gRPC (adapter in phase 4).
 * Idempotent: already provisioned → returns the existing value, never mints a new one.
 * The domain owns this contract; it never calls it (application/process-manager does).
 */
export interface IdentifierProvisioner {
	provisionUpc(input: { releaseId: string; key: IdempotencyKey }): Promise<Upc>;
	provisionIsrcs(input: {
		trackIds: string[];
		key: IdempotencyKey;
	}): Promise<Map<string, Isrc>>;
}
