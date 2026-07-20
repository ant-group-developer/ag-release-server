import { Injectable, Logger } from '@nestjs/common';
import { QaChecker, QaResult } from '../../domain/ports/qa-checker.port';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';
import { CiQaApiService } from '../ci-api/ci-qa-api.service';

/**
 * CiQaAdapter — ACL adapter wrapping CiQaApiService.
 *
 * Translates CI API QA flags response → domain QaResult union.
 * Read-only, naturally idempotent (GET request).
 *
 * ACL Translation per docs B8.3:
 *  · CI {qaflags: []} OR all flags have closed_date !== null → {kind: 'clean'}
 *  · CI {qaflags: [{closed_date: null, ...}]} → {kind: 'flagged', flags: [...]}
 *  · CI 404 (release not found) → {kind: 'clean'}
 *
 * **SEMANTIC CLARIFICATION:**
 * Domain port parameter is `upc` — the release's UPC/GTIN barcode.
 * CI API requires UPC (?gtin=) to look up releases, NOT our internal releaseId.
 *
 * Flow per docs B8.1 + B8.2:
 * 1. GET /releases/v1/.../releases?gtin={{upc}} → get CI internal release_id
 * 2. GET /releases/v2/.../releaseformats/:release_id/qaflags → get QA flags
 * 3. Filter flags where closed_date === null (open flags only)
 *
 * Endpoint: Two-step process (B8.1 → B8.2)
 * Timeout: 30s per request (configured in CiApiService)
 */
@Injectable()
export class CiQaAdapter implements QaChecker {
	private readonly logger = new Logger(CiQaAdapter.name);

	constructor(private readonly ciQaApiService: CiQaApiService) {}

	async check(input: {
		upc: string;
		key: IdempotencyKey;
	}): Promise<QaResult> {
		const { upc } = input;

		try {
			// Step 1 (B8.1): Get CI internal release_id by UPC
			const ciReleaseId =
				await this.ciQaApiService.getReleaseIdByUpc(upc);

			if (!ciReleaseId) {
				this.logger.log(
					`[check] upc=${upc}: release not found → clean`,
				);
				return { kind: 'clean' };
			}

			// Step 2 (B8.2): Get QA flags (open flags split into blocking vs warning)
			const result = await this.ciQaApiService.getQaFlags(ciReleaseId);

			// Non-blocker open flags are surfaced as warnings but do NOT gate (B8.3).
			if (result.warningFlags.length > 0) {
				this.logger.warn(
					`[check] upc=${upc}: ${result.warningFlags.length} non-blocking warning flag(s) (not gating)`,
				);
			}

			if (!result.hasBlockingFlags) {
				this.logger.log(
					`[check] upc=${upc}: clean (no blocking flags)`,
				);
				return { kind: 'clean' };
			}

			// Map blocking flags to string descriptions for domain.
			// Include advice id (error code) + location so the user ticket is actionable.
			const flags = result.blockingFlags.map((flag) => {
				const loc = flag.trackNumber
					? ` (Track ${flag.trackNumber}${flag.volumePart ? `, Vol ${flag.volumePart}` : ''})`
					: '';
				return `${flag.flagName} [${flag.adviceId}/${flag.severity}]${loc}`;
			});

			this.logger.warn(
				`[check] upc=${upc}: flagged with ${flags.length} blocking issues`,
			);
			return { kind: 'flagged', flags };
		} catch (error: any) {
			if (error?.response?.status === 404) {
				this.logger.log(
					`[check] upc=${upc}: 404 → clean (release not found)`,
				);
				return { kind: 'clean' };
			}

			this.logger.error(
				`[check] upc=${upc}: error → ${error?.message || error}`,
			);
			throw error;
		}
	}
}
