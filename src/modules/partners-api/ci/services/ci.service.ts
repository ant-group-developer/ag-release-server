import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { GetCiReleasesDto } from '../dtos/ci.dto';

@Injectable()
export class CiService {
	private readonly logger = new Logger(CiService.name);

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

	async getReleaseDetail(releaseId: string): Promise<any> {
		try {
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
