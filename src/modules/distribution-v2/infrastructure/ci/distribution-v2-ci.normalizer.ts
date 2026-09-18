import {
	DistributionV2CiImportFileResult,
	DistributionV2CiImportResult,
	DistributionV2CiImportStatus,
	DistributionV2CiQaResult,
} from '../../application/ports/ci-import-qa.port';

export function normalizeCiImportResponses(
	responses: readonly unknown[],
	input: {
		readonly upc: string;
		readonly importExternalIdentifier: string;
	},
): DistributionV2CiImportResult {
	const items = responses.flatMap((response) =>
		extractCollectionItems(response),
	);
	const matching = items.filter((item) => {
		const identifier = firstString(
			item.import_external_identifier,
			item.external_identifier,
		);
		return !identifier || identifier === input.importExternalIdentifier;
	});
	const files = matching.flatMap((item) =>
		asArray(item.import_file)
			.filter((file) => matchesPackage(file, input.upc))
			.map(normalizeImportFile),
	);
	const warnings = unique(files.flatMap((file) => file.warnings));
	const errors = unique(files.flatMap((file) => file.errors));
	const statuses = [
		...matching.map((item) =>
			String(
				item.status ?? item.importEntity?.status ?? '',
			).toLowerCase(),
		),
		...files.map((file) => String(file.status ?? '').toLowerCase()),
	].filter(Boolean);
	const status = normalizeImportStatus(statuses, matching.length > 0);
	const first = matching[0];

	return {
		status,
		found: matching.length > 0,
		importExternalIdentifier:
			firstString(
				first?.import_external_identifier,
				first?.external_identifier,
			) ?? input.importExternalIdentifier,
		internalBatchId: firstString(
			first?.internal_batch_identifier,
			first?.batch_id,
			first?.id,
		),
		importBatchId: firstString(first?.id, first?.internal_batch_identifier),
		importEntityId: firstString(
			first?.importEntity?.identifier,
			first?.importEntity?.id,
			first?.importEntity?.import_id,
		),
		files,
		warnings,
		errors,
		raw: responses.length === 1 ? responses[0] : responses,
		checkedAt: new Date().toISOString(),
		pageCount: responses.length,
	};
}

export function normalizeCiQaResponses(
	responses: readonly unknown[],
	input: { readonly releaseFormatId: string },
): DistributionV2CiQaResult {
	const flags = responses.flatMap((response) =>
		extractCollectionItems(response),
	);
	const blockers = flags.filter((flag) => {
		const type = asRecord(flag.qa_flag_type);
		const isBlocker =
			type?.is_blocker === true ||
			String(type?.is_blocker ?? '').toLowerCase() === 'true';
		return isBlocker && !flag.closed_date;
	});

	return {
		releaseFormatId: input.releaseFormatId,
		flags,
		blockers,
		raw: responses.length === 1 ? responses[0] : responses,
		pageCount: responses.length,
		checkedAt: new Date().toISOString(),
	};
}

export function extractCollectionItems(value: unknown): Record<string, any>[] {
	if (Array.isArray(value)) {
		return value.filter(isRecord);
	}
	if (!isRecord(value)) return [];
	if (Array.isArray(value._embedded)) {
		return value._embedded.filter(isRecord);
	}
	if (isRecord(value._embedded) && Array.isArray(value._embedded.items)) {
		return value._embedded.items.filter(isRecord);
	}
	if (Array.isArray(value.items)) return value.items.filter(isRecord);
	return [value];
}

function normalizeImportFile(
	file: Record<string, any>,
): DistributionV2CiImportFileResult {
	const descriptions = asArray(
		file.import_status?.description ?? file.description,
	);
	const warnings = unique(
		descriptions.flatMap((description) =>
			extractMessages(description, 'warnings'),
		),
	);
	const errors = unique([
		...descriptions.flatMap((description) =>
			extractMessages(description, 'errors'),
		),
		...(typeof file.import_status === 'object'
			? extractMessages(file.import_status, 'errors')
			: []),
		...(typeof file.import_status === 'object'
			? extractMessages(file.import_status, 'error')
			: []),
	]);

	return {
		packageId: firstString(file.package_id, file.GTIN, file.gtin),
		status: firstString(
			file.import_status,
			file.status,
			file.import_status?.status,
		),
		warnings,
		errors,
		raw: file,
	};
}

function normalizeImportStatus(
	statuses: readonly string[],
	found: boolean,
): DistributionV2CiImportStatus {
	if (!found) return 'PENDING';
	if (
		statuses.some((status) => status === 'problem' || status === 'failed')
	) {
		return 'PROBLEM';
	}
	if (
		statuses.some(
			(status) =>
				status === 'pending' ||
				status === 'processing' ||
				status === 'running' ||
				status === 'queued' ||
				status === 'in_progress',
		)
	) {
		return 'PENDING';
	}
	if (
		statuses.length > 0 &&
		statuses.every((status) =>
			['complete', 'completed', 'success', 'live'].includes(status),
		)
	) {
		return 'COMPLETE';
	}
	return 'UNKNOWN';
}

function matchesPackage(file: Record<string, any>, upc: string): boolean {
	const packageId = firstString(file.package_id, file.GTIN, file.gtin);
	return !packageId || packageId === upc;
}

function extractMessages(value: unknown, key: string): string[] {
	if (typeof value === 'string') return value.trim() ? [value] : [];
	if (Array.isArray(value)) {
		return value.flatMap((item) => extractMessages(item, key));
	}
	if (!isRecord(value)) return [];
	const candidate = value[key];
	if (Array.isArray(candidate)) {
		return candidate.flatMap((item) => normalizeMessage(item));
	}
	if (candidate !== undefined) return normalizeMessage(candidate);
	if (key === 'error' && value.message)
		return normalizeMessage(value.message);
	return [];
}

function normalizeMessage(value: unknown): string[] {
	if (typeof value === 'string') return value.trim() ? [value] : [];
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		const message = record.message ?? record.error ?? record.description;
		if (typeof message === 'string' && message.trim()) return [message];
		try {
			return [JSON.stringify(value)];
		} catch {
			return ['Unknown CI import message'];
		}
	}
	if (value === undefined || value === null) return [];
	if (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean' ||
		typeof value === 'bigint'
	) {
		return [String(value)];
	}
	try {
		return [JSON.stringify(value)];
	} catch {
		return ['Unknown CI import message'];
	}
}

function asArray(value: unknown): Record<string, any>[] {
	if (Array.isArray(value)) return value.filter(isRecord);
	return value && typeof value === 'object'
		? [value as Record<string, any>]
		: [];
}

function asRecord(value: unknown): Record<string, any> | null {
	return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, any> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function firstString(...values: unknown[]): string | null {
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) return value.trim();
		if (typeof value === 'number') return String(value);
	}
	return null;
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values.filter((value) => value.trim()))];
}
