import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { GetCiReleasesDto } from '../dtos/ci.dto';
import {
	CiDeliverDesire,
	CiDeliverDesireResponse,
} from '../interfaces/ci-deliver-desire.interface';
import { CiExportListResponse } from '../interfaces/ci-export.interface';

export interface CiDspStatus {
	ciCode: string;
	name: string;
	status: string;
}

export interface GetCiDspStatusesInput {
	upc: string;
	dspCiCodes?: string[];
}

@Injectable()
export class CiService {
	private readonly logger = new Logger(CiService.name);

	constructor(private readonly appConfigService: AppConfigService) { }

	private get client(): AxiosInstance {
		const baseUrl = this.appConfigService.getValue<string>(
			'config.partners.ci.baseUrl',
		);

		const token = this.appConfigService.getValue<string>(
			'config.partners.ci.token',
		);

		return axios.create({
			baseURL: baseUrl,
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
		});
	}

	get organisationId(): string {
		return (
			this.appConfigService.getValue<string>(
				'config.partners.ci.organisationId',
			) || '52978127640016'
		);
	}

	private buildParams(params?: any): URLSearchParams {
		const searchParams = new URLSearchParams();
		if (params) {
			for (const key of Object.keys(params)) {
				if (Array.isArray(params[key])) {
					params[key].forEach((val: any) =>
						searchParams.append(key, String(val)),
					);
				} else if (params[key] !== undefined && params[key] !== null) {
					searchParams.append(key, String(params[key]));
				}
			}
		}
		return searchParams;
	}

	/**
	 * Lấy thông tin detail của release
	 */
	async getReleaseDetail(releaseId: string): Promise<any> {
		try {
			// Lưu ý: url có thể không có /releases/v1/ tuỳ thuộc baseUrl, nhưng ta bám sát theo mô tả
			const endpoint = `/releases/v1/organisations/${this.organisationId}/releases/${releaseId}`;
			const response = await this.client.get(endpoint);
			return response.data;
		} catch (error) {
			this.logger.error(
				`Error getReleaseDetail at ${releaseId}`,
				error?.message || error,
			);
			throw error;
		}
	}

	/**
	 * Lấy thông tin tất cả release của organisation
	 * Hỗ trợ nhận params dạng mảng (vd: gtin=xxx&gtin=yyy -> gtin: ['xxx', 'yyy'])
	 */
	async getReleases(params?: GetCiReleasesDto): Promise<any> {
		try {
			const endpoint = `/releases/v1/organisations/${this.organisationId}/releases`;
			const response = await this.client.get(endpoint, {
				params: this.buildParams(params),
			});
			return response.data;
		} catch (error) {
			this.logger.error(`Error getReleases`, error?.message || error);
			throw error;
		}
	}

	/**
	 * Lấy tất cả QA flags của 1 bản release
	 */
	async getReleaseQaFlags(releaseId: string): Promise<any> {
		try {
			const endpoint = `/releases/v1/organisations/${this.organisationId}/releases/${releaseId}/metadata/qa_flags`;
			const response = await this.client.get(endpoint);
			return response.data;
		} catch (error) {
			this.logger.error(
				`Error getReleaseQaFlags at ${releaseId}`,
				error?.message || error,
			);
			throw error;
		}
	}

	/**
	 * Trigger deliver desire cho 1 export
	 * GET {{baseUrl}}/exports/v1/organisations/:organisation_id/export/:export_id/deliver_desire
	 */
	async deliverDesire(exportId: string): Promise<CiDeliverDesireResponse> {
		try {
			const endpoint = `/exports/v1/organisations/${this.organisationId}/export/${exportId}/deliver_desire`;
			const response = await this.client.get(endpoint);
			return response.data;
		} catch (error) {
			this.logger.error(
				`Error deliverDesire at exportId=${exportId}`,
				error?.message || error,
			);
			throw error;
		}
	}

	/**
	 * Lấy deliver desire của tất cả exports theo GTIN
	 * Flow: getExportsByGtin → deliverDesire per export
	 */
	async deliverDesireByGtin(gtin: string) {
		const exportList = await this.getExportsByGtin(gtin);
		const exports = exportList._embedded || [];

		const results = [];
		for (const exp of exports) {
			try {
				const desire = await this.deliverDesire(exp.export_id);
				results.push({
					export_id: exp.export_id,
					status: exp.status,
					desires: desire._embedded || [],
				});
			} catch (err) {
				results.push({
					export_id: exp.export_id,
					status: exp.status,
					desires: [],
					error: err?.message,
				});
			}
		}

		return results;
	}

	/**
	 * Lấy danh sách exports theo GTIN (UPC)
	 * GET {{baseUrl}}/exports/v1/organisations/:organisation_id/export?gtin=xxx
	 */
	async getExportsByGtin(gtin: string): Promise<CiExportListResponse> {
		try {
			const endpoint = `/exports/v1/organisations/${this.organisationId}/export`;
			const response = await this.client.get(endpoint, {
				params: { gtin },
			});
			return response.data;
		} catch (error) {
			this.logger.error(
				`Error getExportsByGtin at gtin=${gtin}`,
				error?.message || error,
			);
			throw error;
		}
	}

	/**
	 * Lấy trạng thái DSP từ CI theo UPC.
	 * Flow: getExportsByGtin → deliverDesire per export → gom theo ciCode (musicService.dpc), lấy theo ngày mới nhất.
	 */
	async getStatusDsps({
		upc,
		dspCiCodes,
	}: GetCiDspStatusesInput): Promise<CiDspStatus[]> {
		// 1. Lấy tất cả exports theo UPC
		const exportList = await this.getExportsByGtin(upc);
		const exports = exportList._embedded || [];

		if (exports.length === 0) {
			this.logger.log(`[getStatusDsp] No exports found for UPC: ${upc}`);
		}

		// 2. Gọi deliverDesire cho từng export, gom tất cả deliver desires
		const allDesires: CiDeliverDesire[] = [];
		for (const exp of exports) {
			try {
				const desireResponse = await this.deliverDesire(exp.export_id);
				const desires = desireResponse._embedded || [];
				allDesires.push(...desires);
			} catch (err) {
				this.logger.warn(
					`[getStatusDsp] Failed to get deliverDesire for export ${exp.export_id}: ${err?.message}`,
				);
			}
		}

		// 3. Gom theo ciCode (musicService.dpc), giữ bản có modify_time mới nhất
		const latestByDsp = new Map<string, CiDeliverDesire>();

		for (const desire of allDesires) {
			const ciCode = desire.musicService?.dpc;
			if (!ciCode) continue;

			const existing = latestByDsp.get(ciCode);
			if (
				!existing ||
				new Date(desire.modify_time) > new Date(existing.modify_time)
			) {
				latestByDsp.set(ciCode, desire);
			}
		}

		// 4. Map ra output
		const allStatuses: CiDspStatus[] = Array.from(
			latestByDsp,
			([ciCode, desire]) => ({
				ciCode,
				name: desire.musicService?.name || ciCode,
				status: desire.exportBatch?.batch_transfer_status || 'unknown',
			}),
		);

		const requestedCiCodes = dspCiCodes?.filter(Boolean);
		const result = requestedCiCodes
			? requestedCiCodes.map((ciCode) => {
					const found = allStatuses.find(
						(item) =>
							item.ciCode.toLowerCase() === ciCode.toLowerCase(),
					);

					return (
						found ?? {
							ciCode,
							name: ciCode,
							status: 'not_found',
						}
					);
				})
			: allStatuses;

		this.logger.log(
			`[getStatusDsps] UPC=${upc}: ${result.length} DSPs found`,
		);
		return result;
	}

	// lấy thông tin import
	// {{baseUrl}}/imports/v1/organisations/:organisation_id/batch/:batchId
	async getImportDetail(batchId: string): Promise<any> {
		try {
			const endpoint = `/imports/v1/organisations/${this.organisationId}/batch/${batchId}`;
			const response = await this.client.get(endpoint);
			return response.data;
		} catch (error) {
			this.logger.error(
				`Error getImportDetail at ${batchId}`,
				error?.message || error,
			);
			throw error;
		}
	}
}
