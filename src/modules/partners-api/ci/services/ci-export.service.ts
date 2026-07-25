import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { GetCiDeliverDesireDto } from '../dtos/ci.dto';
import { CiDeliverDesire } from '../interfaces/ci-deliver-desire.interface';

export interface CiDspStatus {
	ciCode: string;
	name: string;
	status: string;
}

export interface GetCiDspStatusesInput {
	releaseFormatId: string;
}

@Injectable()
export class CiExportService {
	private readonly logger = new Logger(CiExportService.name);

	constructor(private readonly appConfigService: AppConfigService) {}

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

	private buildParams(params?: Record<string, any>): URLSearchParams {
		const searchParams = new URLSearchParams();
		if (!params) return searchParams;

		for (const key of Object.keys(params)) {
			const value = params[key];
			if (Array.isArray(value)) {
				value.forEach((item) => searchParams.append(key, String(item)));
			} else if (value !== undefined && value !== null) {
				searchParams.append(key, String(value));
			}
		}

		return searchParams;
	}

	async getDeliverDesire(params?: GetCiDeliverDesireDto): Promise<any> {
		try {
			const endpoint = `/exports/v1/organisations/${this.organisationId}/deliver_desire`;
			const response = await this.client.get(endpoint, {
				params: this.buildParams({
					...params,
					transfer_batch_status: 'transferred',
				}),
			});

			return response.data;
		} catch (error) {
			this.logger.error(
				`Error getDeliverDesire`,
				error?.message || error,
			);
			throw error;
		}
	}

	async getStatusDsps({
		releaseFormatId,
	}: GetCiDspStatusesInput): Promise<CiDspStatus[]> {
		const res = await this.getDeliverDesire({
			release_id: releaseFormatId,
			pageSize: 200,
		});

		const desires: CiDeliverDesire[] = res?._embedded ?? [];
		const latestByDsp = new Map<string, CiDeliverDesire>();

		for (const desire of desires) {
			const ciCode = desire.musicService?.dpc;
			if (!ciCode) continue;

			const key = ciCode.toLowerCase();
			const existing = latestByDsp.get(key);
			if (
				!existing ||
				this.getDeliverDesireTimestamp(desire) >=
					this.getDeliverDesireTimestamp(existing)
			) {
				latestByDsp.set(key, desire);
			}
		}

		const result = Array.from(latestByDsp.values(), (desire) => ({
			ciCode: desire.musicService?.dpc || '',
			name: desire.musicService?.name || desire.musicService?.dpc || '',
			status:
				desire.exportBatch?.batch_transfer_status ||
				desire.status ||
				'not_found',
		}));

		this.logger.log(
			`[getStatusDsps] releaseFormatId=${releaseFormatId}: ${result.length} DSPs found`,
		);

		return result;
	}

	private getDeliverDesireTimestamp(desire: CiDeliverDesire): number {
		const dateValue =
			desire.exportBatch?.transfer_end_time ||
			desire.modify_time ||
			desire.create_time;
		const timestamp = dateValue ? new Date(dateValue).getTime() : 0;
		return Number.isNaN(timestamp) ? 0 : timestamp;
	}
}
