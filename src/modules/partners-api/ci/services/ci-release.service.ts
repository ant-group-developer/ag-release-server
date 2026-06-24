import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { GetCiQaFlagsDto, GetCiReleaseFormatsDto } from '../dtos/ci.dto';

@Injectable()
export class CiReleaseService {
	private readonly logger = new Logger(CiReleaseService.name);

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

	async getReleaseFormatsV1(params?: GetCiReleaseFormatsDto): Promise<any> {
		try {
			const endpoint = `/releases/v1/organisations/${this.organisationId}/releaseformats`;
			const response = await this.client.get(endpoint, {
				params: this.buildParams(params),
			});
			return response.data;
		} catch (error) {
			this.logger.error(
				`Error getReleaseFormats`,
				error?.message || error,
			);
			throw error;
		}
	}

	async getReleaseFormatOneV1(
		params?: GetCiReleaseFormatsDto,
	): Promise<any | null> {
		const releaseFormats = await this.getReleaseFormatsV1(params);
		return releaseFormats?._embedded?.[0] ?? null;
	}

	async getQaFlagsV1(params: GetCiQaFlagsDto): Promise<any> {
		try {
			const { releaseFormatsId, ...query } = params;
			const endpoint = `/releases/v1/organisations/${this.organisationId}/releaseformats/${releaseFormatsId}/qaflags`;
			const response = await this.client.get(endpoint, {
				params: this.buildParams(query),
			});
			return response.data;
		} catch (error) {
			this.logger.error(`Error getQaFlags`, error?.message || error);
			throw error;
		}
	}

	async getReleaseFormatsV2(params?: GetCiReleaseFormatsDto): Promise<any> {
		try {
			const endpoint = `/releases/v2/organisations/${this.organisationId}/releaseformats`;
			const response = await this.client.get(endpoint, {
				params: this.buildParams(params),
			});
			return response.data;
		} catch (error) {
			this.logger.error(
				`Error getReleaseFormatsV2`,
				error?.message || error,
			);
			throw error;
		}
	}

	async getReleaseFormatOneV2(
		params?: GetCiReleaseFormatsDto,
	): Promise<any | null> {
		const releaseFormats = await this.getReleaseFormatsV2(params);
		return releaseFormats?._embedded?.[0] ?? null;
	}

	async getQaFlagsV2(params: GetCiQaFlagsDto): Promise<any> {
		try {
			const { releaseFormatsId, ...query } = params;
			const endpoint = `/releases/v2/organisations/${this.organisationId}/releaseformats/${releaseFormatsId}/qaflags`;
			const response = await this.client.get(endpoint, {
				params: this.buildParams(query),
			});
			return response.data;
		} catch (error) {
			this.logger.error(`Error getQaFlags`, error?.message || error);
			throw error;
		}
	}
}
