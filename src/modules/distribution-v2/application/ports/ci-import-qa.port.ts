export type DistributionV2CiImportStatus =
	| 'PENDING'
	| 'COMPLETE'
	| 'PROBLEM'
	| 'UNKNOWN';

export interface DistributionV2CiImportFileResult {
	readonly packageId: string | null;
	readonly status: string | null;
	readonly warnings: readonly string[];
	readonly errors: readonly string[];
	readonly raw: Readonly<Record<string, unknown>>;
}

export interface DistributionV2CiImportResult {
	readonly status: DistributionV2CiImportStatus;
	readonly found: boolean;
	readonly importExternalIdentifier: string | null;
	readonly internalBatchId: string | null;
	readonly importBatchId: string | null;
	readonly importEntityId: string | null;
	readonly files: readonly DistributionV2CiImportFileResult[];
	readonly warnings: readonly string[];
	readonly errors: readonly string[];
	readonly raw: unknown;
	readonly checkedAt: string;
	readonly pageCount: number;
}

export interface DistributionV2CiReleaseResult {
	readonly releaseFormatId: string;
	readonly gtin: string | null;
	readonly raw: Readonly<Record<string, unknown>>;
}

export interface DistributionV2CiQaResult {
	readonly releaseFormatId: string;
	readonly flags: readonly Readonly<Record<string, unknown>>[];
	readonly blockers: readonly Readonly<Record<string, unknown>>[];
	readonly raw: unknown;
	readonly pageCount: number;
	readonly checkedAt: string;
}

export interface DistributionV2CiImportQaPort {
	checkImport(input: {
		readonly upc: string;
		readonly importExternalIdentifier: string;
		readonly pageSize: number;
	}): Promise<DistributionV2CiImportResult>;

	findReleaseByUpc(input: {
		readonly upc: string;
		readonly pageSize: number;
	}): Promise<DistributionV2CiReleaseResult | null>;

	checkQa(input: {
		readonly releaseFormatId: string;
		readonly pageSize: number;
	}): Promise<DistributionV2CiQaResult>;
}

export const DISTRIBUTION_V2_CI_IMPORT_QA = Symbol(
	'DISTRIBUTION_V2_CI_IMPORT_QA',
);
