import { Injectable, Logger } from '@nestjs/common';
import {
	IngestResultReader,
	IngestStatus,
} from '../../domain/ports/ingest-result-reader.port';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';
import { CiImportApiService } from '../ci-api/ci-import-api.service';

/**
 * CiImportAdapter — ACL adapter wrapping CiImportApiService.
 *
 * Translates CI API `/imports/v1/.../batch` response → domain IngestStatus union.
 * Read-only, naturally idempotent (GET request).
 *
 * ACL Translation per docs B7.2 — evaluated PER-PACKAGE (per-UPC), not per-batch:
 *  · package not in batch yet → {kind: 'pending'} (this UPC not ingested yet)
 *  · package {warnings: [...]} OR {import_status: 'problem'} → {kind: 'problem', errors}
 *  · package {warnings: [], import_status: 'complete'} → {kind: 'ok'}
 *
 * A batch may carry MANY packages (`import_file[]`, each with its own GTIN/UPC).
 * One package's problem must NOT fail a sibling package, so we select the package
 * matching `input.upc` and translate only that package's status.
 *
 * Endpoint: GET /imports/v1/organisations/:org_id/batch?import_external_identifier={{batchId}}
 * Timeout: 30s (configured in CiApiService)
 */
@Injectable()
export class CiImportAdapter implements IngestResultReader {
	private readonly logger = new Logger(CiImportAdapter.name);

	constructor(private readonly ciImportApiService: CiImportApiService) {}

	async read(input: {
		batchId: string;
		upc: string;
		key: IdempotencyKey;
	}): Promise<IngestStatus> {
		const { batchId, upc } = input;

		try {
			const result =
				await this.ciImportApiService.getImportBatch(batchId);

			// Batch not found = not ingested yet
			if (!result.found) {
				this.logger.log(
					`[read] batchId=${batchId} upc=${upc}: batch not found → pending`,
				);
				return { kind: 'pending' };
			}

			// Select ONLY this UPC's package — ignore sibling packages in the batch.
			const pkg = result.packages.find((p) => p.packageId === upc);
			if (!pkg) {
				this.logger.log(
					`[read] batchId=${batchId} upc=${upc}: package not in batch yet → pending`,
				);
				return { kind: 'pending' };
			}

			if (pkg.hasProblems) {
				this.logger.warn(
					`[read] batchId=${batchId} upc=${upc}: problem with ${pkg.warnings.length} warnings`,
				);
				return { kind: 'problem', errors: pkg.warnings };
			}

			// import_status still processing (not 'complete') → keep polling.
			if (
				pkg.importStatus !== 'complete' &&
				pkg.importStatus !== 'live'
			) {
				this.logger.log(
					`[read] batchId=${batchId} upc=${upc}: status=${pkg.importStatus} → pending`,
				);
				return { kind: 'pending' };
			}

			this.logger.log(`[read] batchId=${batchId} upc=${upc}: ok`);
			return { kind: 'ok' };
		} catch (error: any) {
			if (error?.response?.status === 404) {
				this.logger.log(
					`[read] batchId=${batchId} upc=${upc}: 404 → pending (not ingested yet)`,
				);
				return { kind: 'pending' };
			}

			this.logger.error(
				`[read] batchId=${batchId} upc=${upc}: error → ${error?.message || error}`,
			);
			throw error;
		}
	}
}
