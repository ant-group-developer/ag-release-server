import { Injectable, Logger } from '@nestjs/common';
import {
	DeliveryStatusReader,
	DspLiveStatus,
} from '../../domain/ports/delivery-status-reader.port';
import { DspCode } from '../../domain/value-objects/dsp-code.vo';
import { CiDeliverDesireApiService } from '../ci-api/ci-deliver-desire-api.service';

/**
 * CiDeliverDesireAdapter — ACL adapter wrapping CiDeliverDesireApiService.
 *
 * Translates CI API `/exports/v1/.../deliver_desire` response → Map<dspCode, DspLiveStatus>.
 * Read-only, naturally idempotent (GET request).
 *
 * ACL Translation per docs B10.2:
 *  · CI {status: 'complete', batch_transfer_status: 'transferred'} → 'live'
 *  · CI {status: 'complete', batch_transfer_status: 'pending'} → 'pending'
 *  · CI DSP not in response → 'pending'
 *  · CI 404 or error → all DSPs 'pending'
 *
 * **SEMANTIC CLARIFICATION:**
 * Domain port parameter is `upc` — the release's UPC/GTIN barcode.
 * CI API requires UPC (?gtin=) to look up delivery status, NOT an import batch identifier.
 *
 * `upc` format: "7316480656310" (barcode), NOT import batch timestamp "20260704183607027".
 *
 * Endpoint: GET /exports/v1/organisations/:org_id/deliver_desire?gtin={{upc}}
 * Timeout: 30s (configured in CiApiService)
 */
@Injectable()
export class CiDeliverDesireAdapter implements DeliveryStatusReader {
	private readonly logger = new Logger(CiDeliverDesireAdapter.name);

	constructor(
		private readonly ciDeliverDesireApiService: CiDeliverDesireApiService,
	) {}

	async read(input: {
		upc: string;
		dspCodes: DspCode[];
	}): Promise<Map<string, DspLiveStatus>> {
		const { upc, dspCodes } = input;

		const result = new Map<string, DspLiveStatus>();

		try {
			const dspCodeStrings = dspCodes.map((code) => code.value);
			const deliveryStatuses =
				await this.ciDeliverDesireApiService.getDeliverDesire(
					upc,
					dspCodeStrings,
				);

			// Map CI delivery status to domain DspLiveStatus
			for (const dspCode of dspCodes) {
				const status = deliveryStatuses.get(dspCode.value);

				if (!status) {
					result.set(dspCode.value, 'pending');
					continue;
				}

				// Translate CI status to domain status
				const liveStatus = this.translateStatus(
					status.status,
					status.transferStatus,
				);
				result.set(dspCode.value, liveStatus);
			}

			this.logger.log(
				`[read] upc=${upc}: ${result.size} DSP statuses read`,
			);
			return result;
		} catch (error: any) {
			if (error?.response?.status === 404) {
				this.logger.log(`[read] upc=${upc}: 404 → all DSPs pending`);
				for (const dspCode of dspCodes) {
					result.set(dspCode.value, 'pending');
				}
				return result;
			}

			this.logger.error(
				`[read] upc=${upc}: error → ${error?.message || error}`,
			);
			throw error;
		}
	}

	/**
	 * Translate CI deliver_desire status → domain DspLiveStatus.
	 *
	 * Per docs B10.2:
	 *  · status: 'complete' + transfer_batch_status: 'transferred' → 'live' (confirmed on DSP)
	 *  · status: 'complete' but transfer incomplete → 'pending'
	 *  · status: 'rejected' → 'rejected'
	 *  · Any other status → 'pending'
	 */
	private translateStatus(
		status: string,
		transferStatus: string,
	): DspLiveStatus {
		const normalizedStatus = status.toLowerCase();
		const normalizedTransfer = transferStatus.toLowerCase();

		// Complete + transferred = live on DSP
		if (
			normalizedStatus === 'complete' &&
			normalizedTransfer === 'transferred'
		) {
			return 'live';
		}

		// Explicitly rejected
		if (normalizedStatus === 'rejected') {
			return 'rejected';
		}

		// Everything else is pending (processing, waiting, etc.)
		return 'pending';
	}
}
