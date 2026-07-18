import { IdentifierProvisioner } from '../../domain/ports/identifier-provisioner.port';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';
import { Isrc } from '../../domain/value-objects/isrc.vo';
import { Upc } from '../../domain/value-objects/upc.vo';

/**
 * InMemoryIdentifierProvisioner — test double cho IdentifierProvisioner.
 * Idempotent theo releaseId/trackId (khớp contract port): gọi lại KHÔNG cấp mã mới.
 */
export class InMemoryIdentifierProvisioner implements IdentifierProvisioner {
	private readonly upcByRelease = new Map<string, Upc>();
	private readonly isrcByTrack = new Map<string, Isrc>();
	private nextUpcSeq = 100000000000;
	private nextIsrcSeq = 1;

	async provisionUpc(input: {
		releaseId: string;
		key: IdempotencyKey;
	}): Promise<Upc> {
		const existing = this.upcByRelease.get(input.releaseId);
		if (existing) return existing;

		const upc = Upc.create(String(this.nextUpcSeq++));
		this.upcByRelease.set(input.releaseId, upc);
		return upc;
	}

	async provisionIsrcs(input: {
		trackIds: string[];
		key: IdempotencyKey;
	}): Promise<Map<string, Isrc>> {
		const result = new Map<string, Isrc>();
		for (const trackId of input.trackIds) {
			let isrc = this.isrcByTrack.get(trackId);
			if (!isrc) {
				isrc = Isrc.create(this.makeIsrc());
				this.isrcByTrack.set(trackId, isrc);
			}
			result.set(trackId, isrc);
		}
		return result;
	}

	private makeIsrc(): string {
		const seq = String(this.nextIsrcSeq++).padStart(5, '0');
		return `USABC26${seq}`;
	}
}
