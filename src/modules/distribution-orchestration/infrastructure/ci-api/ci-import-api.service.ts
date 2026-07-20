import { Injectable } from '@nestjs/common';
import { CiApiService } from './ci-api.service';

/**
 * Response types per CI API docs (B7)
 */
interface ImportBatchResponse {
	page: number;
	pageSize: number;
	total: number | null;
	organisation_id: number;
	type: 'ImportBatchCollection';
	queryParams: {
		import_external_identifier: string;
	};
	_embedded: ImportBatch[];
}

interface ImportBatch {
	type: 'ImportBatch';
	batch_size: number;
	external_identifier: string;
	status: string;
	status_cause: string;
	importEntity?: {
		type: 'Import';
		name: string;
		asset_type: string;
		status: string;
		number_of_releases: number;
		import_external_identifier: string;
		releaseFormats?: any[];
	};
	import_file: ImportFile[];
	notes?: string;
}

interface ImportFile {
	status: string;
	import_status: string;
	status_cause: string;
	package_id: string;
	GTIN?: string; // UPC of the package this file belongs to
	description: ImportDescription[];
}

interface ImportDescription {
	artists?: string;
	title?: string;
	barcode?: string;
	warnings: string[];
}

/** Per-package (per-UPC) ingest outcome within a batch. */
export interface ImportPackageResult {
	packageId: string; // GTIN / UPC of this package
	importStatus: string; // complete | problem | pending | ...
	warnings: string[];
	hasProblems: boolean;
}

export interface ImportBatchResult {
	/** Batch external_identifier — timestamp folder name (e.g., "20260704183607027"), NOT a UPC. */
	batchExternalId: string;
	found: boolean;
	batchStatus: string; // overall batch status (informational only)
	/** One entry per package (UPC) in the batch — caller filters to the UPC it cares about. */
	packages: ImportPackageResult[];
}

/**
 * CiImportApiService — CI Import Batch API (B7)
 *
 * Endpoint: GET /imports/v1/organisations/:org_id/batch?import_external_identifier=...
 *
 * Purpose: Check if CI successfully processed the uploaded batch.
 *
 * Per docs B7.2:
 * - Check `description[].warnings[]` for import errors
 * - Check `import_status === "problem"` for failures
 * - Empty warnings + complete status = success
 */
@Injectable()
export class CiImportApiService extends CiApiService {
	/**
	 * Get import batch status by external identifier (timestamp folder name).
	 *
	 * @param batchExternalId - The batch external_identifier / timestamp folder name (e.g., "20260704183607027"), NOT a UPC
	 * @returns Import batch result with warnings extracted
	 */
	async getImportBatch(batchExternalId: string): Promise<ImportBatchResult> {
		const endpoint = `/imports/v1/organisations/${this.orgId}/batch`;
		const params = { import_external_identifier: batchExternalId };

		this.logger.log(`[getImportBatch] batchExternalId=${batchExternalId}`);

		const response = await this.get<ImportBatchResponse>(endpoint, params);

		if (!response._embedded || response._embedded.length === 0) {
			this.logger.log(
				`[getImportBatch] batchExternalId=${batchExternalId}: not found`,
			);
			return {
				batchExternalId,
				found: false,
				batchStatus: 'not_found',
				packages: [],
			};
		}

		const batch = response._embedded[0];

		// Group import_file entries by package (UPC). A batch may carry MANY packages;
		// each package's import_status is independent (one problem ≠ whole batch failed).
		// Caller filters `packages` to the UPC of the distribution it is checking.
		const byPackage = new Map<string, ImportPackageResult>();
		for (const file of batch.import_file) {
			const packageId = file.GTIN ?? file.package_id;
			const entry = byPackage.get(packageId) ?? {
				packageId,
				importStatus: file.import_status,
				warnings: [],
				hasProblems: false,
			};

			// A package is a problem if ANY of its files is a problem or carries warnings.
			if (file.import_status === 'problem') {
				entry.importStatus = 'problem';
				entry.hasProblems = true;
			}
			for (const desc of file.description ?? []) {
				if (desc.warnings && desc.warnings.length > 0) {
					entry.hasProblems = true;
					entry.warnings.push(...desc.warnings);
				}
			}
			byPackage.set(packageId, entry);
		}

		const packages = [...byPackage.values()];
		this.logger.log(
			`[getImportBatch] batchExternalId=${batchExternalId}: ${packages.length} package(s), ` +
				`${packages.filter((p) => p.hasProblems).length} with problems`,
		);

		return {
			batchExternalId,
			found: true,
			batchStatus: batch.status,
			packages,
		};
	}
}
