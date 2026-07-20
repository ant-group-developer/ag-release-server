import { Injectable } from '@nestjs/common';
import { CiApiService } from './ci-api.service';

/**
 * Response types per CI API docs (B8.1, B8.2)
 */
interface ReleaseLookupResponse {
	page: number;
	pageSize: number;
	organisation_id: number;
	type: 'ReleasesCollection';
	_embedded: ReleaseFormat[];
}

interface ReleaseFormat {
	type: 'ReleaseFormat';
	qa_flag: number;
	barcode: string;
	gtin: string;
	status: string;
	title: string;
	track_count: number;
	format_type: string;
	display_artist: string;
	release_id: string;
	_links?: any;
}

interface QaFlagsResponse {
	page: number;
	pageSize: number;
	total: number;
	organisation_id: number;
	release_id: number;
	type: 'QaFlagCollection';
	_embedded: QaFlag[];
}

interface QaFlag {
	type: 'qaflag';
	closed_date: string | null;
	closed_log_message: string | null;
	watchlist_match_detail: unknown;
	track_number: string | null;
	volume_part: number | null;
	qa_flag_id: string;
	id: number;
	create_time: string;
	modify_time: string;
	qa_flag_type: {
		type: 'qaflagtype';
		category: string;
		is_blocker: boolean;
		is_closeable: boolean;
		is_placeholder: boolean;
		public_name: string;
		qa_advice_id: string;
		advisor_message: string;
		suggested_action: string;
		severity: string;
		id: number;
		modify_time: string;
	};
}

/** One open QA flag, enriched with the fields needed to surface a fix to the user. */
export interface OpenQaFlag {
	qaFlagId: string;
	adviceId: string;
	flagName: string;
	severity: string;
	isBlocker: boolean;
	isCloseable: boolean;
	trackNumber: string | null;
	volumePart: number | null;
	suggestedAction: string;
}

export interface QaFlagResult {
	/** CI's internal release_id (NOT our domain releaseId). */
	ciReleaseId: string;
	/** true when ≥1 OPEN flag has is_blocker === true — only these gate the distribution (B8.3). */
	hasBlockingFlags: boolean;
	/** Open flags with is_blocker === true — these block distribution. */
	blockingFlags: OpenQaFlag[];
	/** Open flags with is_blocker === false — surfaced as warnings, do NOT block. */
	warningFlags: OpenQaFlag[];
}

/**
 * CiQaApiService — CI QA Flags API (B8)
 *
 * Step 1 (B8.1): GET /releases/v1/organisations/:org_id/releases?gtin={{upc}}&page_size=1
 * Step 2 (B8.2): GET /releases/v2/organisations/:org_id/releaseformats/:release_id/qaflags?page_size=200
 *
 * Purpose: Check if release has open QA flags.
 *
 * **CRITICAL per docs B8.3:**
 * - Must filter flags where `closed_date === null` (open flags only)
 * - Closed flags (closed_date !== null) are already fixed and should be ignored
 */
@Injectable()
export class CiQaApiService extends CiApiService {
	/**
	 * Get CI internal release_id by UPC (GTIN).
	 *
	 * @param upc - Release UPC/GTIN (e.g., "701798205454")
	 * @returns CI internal release_id (e.g., "117827288390032") or null if not found
	 */
	async getReleaseIdByUpc(upc: string): Promise<string | null> {
		const endpoint = `/releases/v1/organisations/${this.orgId}/releases`;
		const params = { gtin: upc, page_size: 1 };

		this.logger.log(`[getReleaseIdByUpc] upc=${upc}`);

		try {
			const response = await this.get<ReleaseLookupResponse>(
				endpoint,
				params,
			);

			if (!response._embedded || response._embedded.length === 0) {
				this.logger.log(`[getReleaseIdByUpc] upc=${upc}: not found`);
				return null;
			}

			const ciReleaseId = response._embedded[0].release_id;
			this.logger.log(
				`[getReleaseIdByUpc] upc=${upc}: ciReleaseId=${ciReleaseId}`,
			);
			return ciReleaseId;
		} catch (error: any) {
			if (error?.response?.status === 404) {
				this.logger.log(
					`[getReleaseIdByUpc] upc=${upc}: 404 not found`,
				);
				return null;
			}
			throw error;
		}
	}

	/**
	 * Get QA flags for a release.
	 *
	 * **IMPORTANT:** Filters to return ONLY open flags (closed_date === null).
	 * Per docs B8.3: closed flags are already fixed and should not block distribution.
	 *
	 * @param ciReleaseId - CI internal release_id (from getReleaseIdByUpc, NOT our domain releaseId)
	 * @returns QA flag result with only open flags
	 */
	async getQaFlags(ciReleaseId: string): Promise<QaFlagResult> {
		const endpoint = `/releases/v2/organisations/${this.orgId}/releaseformats/${ciReleaseId}/qaflags`;
		const params = { page_size: 200 };

		this.logger.log(`[getQaFlags] ciReleaseId=${ciReleaseId}`);

		try {
			const response = await this.get<QaFlagsResponse>(endpoint, params);

			if (!response._embedded || response._embedded.length === 0) {
				this.logger.log(
					`[getQaFlags] ciReleaseId=${ciReleaseId}: no flags`,
				);
				return {
					ciReleaseId,
					hasBlockingFlags: false,
					blockingFlags: [],
					warningFlags: [],
				};
			}

			// Keep only OPEN flags (closed_date === null) — closed flags are already fixed (B8.3).
			const openFlags: OpenQaFlag[] = response._embedded
				.filter((flag) => flag.closed_date === null)
				.map((flag) => ({
					qaFlagId: flag.qa_flag_id,
					adviceId: flag.qa_flag_type.qa_advice_id,
					flagName: flag.qa_flag_type.public_name,
					severity: flag.qa_flag_type.severity,
					isBlocker: flag.qa_flag_type.is_blocker,
					isCloseable: flag.qa_flag_type.is_closeable,
					trackNumber: flag.track_number,
					volumePart: flag.volume_part,
					suggestedAction: flag.qa_flag_type.suggested_action,
				}));

			// Only is_blocker flags gate the distribution (B8.3). Non-blocker open
			// flags are surfaced as warnings but must NOT block distribution.
			const blockingFlags = openFlags.filter((f) => f.isBlocker);
			const warningFlags = openFlags.filter((f) => !f.isBlocker);

			this.logger.log(
				`[getQaFlags] ciReleaseId=${ciReleaseId}: ${blockingFlags.length} blocking + ` +
					`${warningFlags.length} warning open flags (total: ${response._embedded.length})`,
			);

			return {
				ciReleaseId,
				hasBlockingFlags: blockingFlags.length > 0,
				blockingFlags,
				warningFlags,
			};
		} catch (error: any) {
			if (error?.response?.status === 404) {
				this.logger.log(
					`[getQaFlags] ciReleaseId=${ciReleaseId}: 404 no flags`,
				);
				return {
					ciReleaseId,
					hasBlockingFlags: false,
					blockingFlags: [],
					warningFlags: [],
				};
			}
			throw error;
		}
	}
}
