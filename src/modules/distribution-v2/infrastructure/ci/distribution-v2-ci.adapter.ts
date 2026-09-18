import { Injectable } from '@nestjs/common';
import { CiImportService } from 'src/modules/partners-api/ci/services/ci-import.service';
import { CiReleaseService } from 'src/modules/partners-api/ci/services/ci-release.service';
import { CiService } from 'src/modules/partners-api/ci/services/ci.service';
import {
	DISTRIBUTION_V2_CI_IMPORT_QA,
	DistributionV2CiImportQaPort,
} from '../../application/ports/ci-import-qa.port';
import {
	extractCollectionItems,
	normalizeCiImportResponses,
	normalizeCiQaResponses,
} from './distribution-v2-ci.normalizer';

@Injectable()
export class DistributionV2CiAdapter implements DistributionV2CiImportQaPort {
	constructor(
		private readonly ciImportService: CiImportService,
		private readonly ciService: CiService,
		private readonly ciReleaseService: CiReleaseService,
	) {}

	async checkImport(input: {
		readonly upc: string;
		readonly importExternalIdentifier: string;
		readonly pageSize: number;
	}) {
		const responses: unknown[] = [];
		const maxPages = 100;

		for (let page = 0; page < maxPages; page++) {
			const response = await this.ciImportService.getImports({
				package_id: input.upc,
				external_identifier: input.importExternalIdentifier,
				page,
				page_size: input.pageSize,
				total_count: true,
			});
			responses.push(response);
			if (!hasNextPage(response, page, input.pageSize)) break;
		}

		return normalizeCiImportResponses(responses, input);
	}

	async findReleaseByUpc(input: {
		readonly upc: string;
		readonly pageSize: number;
	}) {
		const maxPages = 100;
		for (let page = 0; page < maxPages; page++) {
			const response = await this.ciService.getReleases({
				upc: [input.upc],
				page,
				page_size: input.pageSize,
			} as any);
			const item = extractCollectionItems(response).find((candidate) => {
				const identifier = [
					candidate.gtin,
					candidate.GTIN,
					candidate.barcode,
					candidate.upc,
				].find((value) => value !== undefined && value !== null);
				return String(identifier ?? '') === input.upc;
			});
			if (item) {
				const releaseFormatId =
					item.release_format_id ?? item.releaseFormatId ?? item.id;
				if (releaseFormatId !== undefined && releaseFormatId !== null) {
					return {
						releaseFormatId: String(releaseFormatId),
						gtin: String(
							item.gtin ?? item.GTIN ?? item.barcode ?? input.upc,
						),
						raw: item,
					};
				}
			}
			if (!hasNextPage(response, page, input.pageSize)) break;
		}
		return null;
	}

	async checkQa(input: {
		readonly releaseFormatId: string;
		readonly pageSize: number;
	}) {
		const responses: unknown[] = [];
		const maxPages = 100;
		for (let page = 0; page < maxPages; page++) {
			const response = await this.ciReleaseService.getQaFlagsV2({
				releaseFormatsId: input.releaseFormatId,
				page,
				page_size: input.pageSize,
			});
			responses.push(response);
			if (!hasNextPage(response, page, input.pageSize)) break;
		}
		return normalizeCiQaResponses(responses, input);
	}
}

function hasNextPage(
	response: unknown,
	page: number,
	pageSize: number,
): boolean {
	if (!response || typeof response !== 'object') return false;
	const value = response as Record<string, any>;
	if (value._links?.next) return true;
	const total = Number(value.total ?? value.total_count);
	if (!Number.isFinite(total) || total <= 0) return false;
	return (page + 1) * pageSize < total;
}

export const DISTRIBUTION_V2_CI_ADAPTER_PROVIDER = {
	provide: DISTRIBUTION_V2_CI_IMPORT_QA,
	useExisting: DistributionV2CiAdapter,
};
