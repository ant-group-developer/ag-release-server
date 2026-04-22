import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import axios, { AxiosInstance } from 'axios';
import { GetCiReleasesDto } from '../dtos/ci.dto';

@Injectable()
export class CiService {
	private readonly logger = new Logger(CiService.name);

	constructor(private readonly appConfigService: AppConfigService) {}

	private get client(): AxiosInstance {
		// const baseUrl = this.appConfigService.getValue<string>('config.partners.ci.baseUrl');
		// const token = this.appConfigService.getValue<string>('config.partners.ci.token');

		const baseUrl = 'https://api.openimp.com'
		const token = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjI1NGUyNjY5MzMxZDExMmVmMGQ2ZDZlODFlMDI4MTVjIn0.eyJpZGVudGlmaWVyIjoibmd1eWVuLXZpZXQtZHVjIiwiY2xpZW50IjoiT3BlbklNUCBBUElzIHRva2VuIHBhZ2UiLCJhcHBsaWNhdGlvbl9pZCI6MzY2NzE3NzkxODAzMjAsInNjb3BlcyI6ImFyY2hpdmVkX29yZ3Msb2ZmbGluZV9hY2Nlc3MsY2F0YWxvZ3VlX3ZpZXcsY2F0YWxvZ3VlX2VkaXQiLCJ1c2VyUGxhdGZvcm1JZCI6MTE3MDI4MDY4NzUwMDA2LCJpYXQiOjE3NzU0NDM4MjYsImV4cCI6MTc3ODAzNTgyNiwiYXVkIjoib3BlbmltcCIsImlzcyI6Imh0dHBzOi8vYXV0aC5vcGVuaW1wLmNvbSIsInN1YiI6Im5ndXllbi12aWV0LWR1YyJ9.x43mgrykTWKRiB42YqEfrWYUgg7LD1orh2PAjhzUw0UQU0OVc4e6qjQzT2jiyjo8n9YGLbzv6B4GOBI8z8wKDE2d4HN7Xafzicn-qIIo3XR80pG__IHgZljtODeMSIZBcHZ3ho32unN9Hw1OxFJPDJiOmQXqgIy8kJf2iv919EnSMynUusxVOrOa7juY33Vbb8HVSgkR2loqF2Zv2dtq06R8ZeeYgyCWVrqblNyuPdQRKzLVDSyfXB3aAKKBKG17MZPtd2kFF5DZEfGviudGYk7D6YSsic6WJVs39ydhwkOl9XGT-K_-jWgTkix0rsFG-vsxoGpuXSAuCgbHX3dx8Q'

		return axios.create({
			baseURL: baseUrl,
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
		});
	}

	get organisationId(): string {
		return this.appConfigService.getValue<string>('config.partners.ci.organisationId') || '52978127640016';
	}


	private buildParams(params?: any): URLSearchParams {
		const searchParams = new URLSearchParams();
		if (params) {
			for (const key of Object.keys(params)) {
				if (Array.isArray(params[key])) {
					params[key].forEach((val: any) => searchParams.append(key, String(val)));
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
			this.logger.error(`Error getReleaseDetail at ${releaseId}`, error?.message || error);
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
			this.logger.error(`Error getReleaseQaFlags at ${releaseId}`, error?.message || error);
			throw error;
		}
	}

	

	// lấy thông tin import
	// {{baseUrl}}/imports/v1/organisations/:organisation_id/batch/:batchId
	async getImportDetail(batchId: string): Promise<any> {
		try {
			const endpoint = `/imports/v1/organisations/${this.organisationId}/batch/${batchId}`;
			const response = await this.client.get(endpoint);
			return response.data;
		} catch (error) {
			this.logger.error(`Error getImportDetail at ${batchId}`, error?.message || error);
			throw error;
		}
	}
}
