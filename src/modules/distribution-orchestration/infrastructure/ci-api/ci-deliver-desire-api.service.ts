import { Injectable } from '@nestjs/common';
import { CiApiService } from './ci-api.service';

/**
 * Response types per CI API docs (B10)
 */
interface DeliverDesireResponse {
	page: number;
	pageSize: number;
	total: string;
	organisation_id: number;
	type: 'DeliverDesireCollection';
	_embedded: DeliverDesire[];
}

interface DeliverDesire {
	type: 'DeliverDesire';
	status: string;
	musicService: {
		name: string;
		dpc: string;
	};
	exportBatch: {
		batch_transfer_status: string;
		transfer_end_time: string;
	};
}

export interface DspDeliveryStatus {
	dspCode: string;
	dspName: string;
	status: string;
	transferStatus: string;
	transferEndTime: string | null;
}

/**
 * CiDeliverDesireApiService — CI Deliver Desire API (B10)
 *
 * Endpoint: GET /exports/v1/organisations/:org_id/deliver_desire?gtin={{upc}}&status=complete&transfer_batch_status=transferred
 *
 * Purpose: Get DSP distribution status for a release.
 *
 * Per docs B10.2:
 * - `musicService.dpc` = DSP code (e.g., "FBL", "ANG")
 * - `status` = "complete" means successfully delivered
 * - `exportBatch.batch_transfer_status` = "transferred" means content sent to DSP
 * - DSPs not in response = pending/not yet delivered
 */
@Injectable()
export class CiDeliverDesireApiService extends CiApiService {
	/**
	 * Get deliver desire status for a release.
	 *
	 * **NOTE:** Endpoint uses UPC (gtin), NOT batchId or releaseId.
	 * Per docs B10: `?gtin={{release_upc}}`
	 *
	 * @param upc - Release UPC/GTIN
	 * @param dspCodes - List of DSP codes to check (e.g., ["FBL", "ANG"])
	 * @returns Map of DSP code -> delivery status
	 */
	async getDeliverDesire(
		upc: string,
		dspCodes: string[],
	): Promise<Map<string, DspDeliveryStatus>> {
		const endpoint = `/exports/v1/organisations/${this.orgId}/deliver_desire`;
		const params = {
			gtin: upc,
			page_size: 200,
			status: 'complete',
			transfer_batch_status: 'transferred',
		};

		this.logger.log(
			`[getDeliverDesire] upc=${upc}, dspCodes=${dspCodes.join(',')}`,
		);

		const result = new Map<string, DspDeliveryStatus>();

		try {
			const response = await this.get<DeliverDesireResponse>(
				endpoint,
				params,
			);

			// Build map of delivered DSPs
			const deliveredDsps = new Map<string, DeliverDesire>();
			if (response._embedded && response._embedded.length > 0) {
				for (const item of response._embedded) {
					const dpcLower = item.musicService.dpc.toLowerCase();
					deliveredDsps.set(dpcLower, item);
				}
			}

			// Map requested DSP codes to delivery status
			for (const dspCode of dspCodes) {
				const keyLower = dspCode.toLowerCase();
				const delivered = deliveredDsps.get(keyLower);

				if (delivered) {
					result.set(dspCode, {
						dspCode: delivered.musicService.dpc,
						dspName: delivered.musicService.name,
						status: delivered.status,
						transferStatus:
							delivered.exportBatch.batch_transfer_status,
						transferEndTime:
							delivered.exportBatch.transfer_end_time,
					});
				} else {
					// DSP not in response = pending
					result.set(dspCode, {
						dspCode,
						dspName: 'Unknown',
						status: 'pending',
						transferStatus: 'pending',
						transferEndTime: null,
					});
				}
			}

			this.logger.log(
				`[getDeliverDesire] upc=${upc}: ${deliveredDsps.size} DSPs delivered, ${result.size} DSPs mapped`,
			);

			return result;
		} catch (error: any) {
			if (error?.response?.status === 404) {
				this.logger.log(
					`[getDeliverDesire] upc=${upc}: 404 → all pending`,
				);
				// All DSPs pending if release not found
				for (const dspCode of dspCodes) {
					result.set(dspCode, {
						dspCode,
						dspName: 'Unknown',
						status: 'pending',
						transferStatus: 'pending',
						transferEndTime: null,
					});
				}
				return result;
			}
			throw error;
		}
	}
}
