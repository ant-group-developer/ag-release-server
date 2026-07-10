import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { GetCiImportsDto } from '../dtos/ci-import.dto';

export interface CiImportSimpleItem {
	status?: any;
	modify_time?: string;
	errors: string[];
}

@Injectable()
export class CiImportService {
	private readonly logger = new Logger(CiImportService.name);

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

	async getImports(params?: GetCiImportsDto): Promise<any> {
		try {
			const endpoint = `/imports/v1/organisations/${this.organisationId}/batch`;
			const response = await this.client.get(endpoint, {
				params: this.buildParams({
					order_by: 'create_desc',
					page: 0,
					page_size: 999,
					total_count: true,
					...params,
				}),
			});
			return response.data;
		} catch (error) {
			this.logger.error(`Error getImports`, error?.message || error);
			throw error;
		}
	}

	async getImportsSimple(
		params?: GetCiImportsDto,
	): Promise<CiImportSimpleItem[]> {
		const imports = await this.getImports(params);
		const items = Array.isArray(imports)
			? imports
			: Array.isArray(imports?._embedded)
				? imports._embedded
				: imports
					? [imports]
					: [];

		return items.map((item: any) => ({
			status: this.getImportStatus(item),
			modify_time: item?.modify_time,
			errors: this.getImportWarnings(item),
		}));
	}

	private getImportStatus(item: any): any {
		const importFiles = Array.isArray(item?.import_file)
			? item.import_file
			: [];

		return importFiles[0]?.import_status;
	}

	private getImportWarnings(item: any): string[] {
		const importFiles = Array.isArray(item?.import_file)
			? item.import_file
			: [];

		return importFiles.flatMap((file: any) => {
			const importStatus = file?.import_status;
			const descriptions = this.normalizeImportDescriptions(
				importStatus?.description ?? file?.description,
			);

			const statusMessages =
				importStatus && typeof importStatus === 'object'
					? this.extractImportWarningMessages(importStatus)
					: [];

			return [
				...statusMessages,
				...descriptions.flatMap((description: any) => {
					return this.extractImportWarningMessages(description);
				}),
			];
		});
	}

	private extractImportWarningMessages(description: any): string[] {
		if (typeof description === 'string') {
			return description.trim() ? [description] : [];
		}

		const warnings = Array.isArray(description?.warnings)
			? description.warnings
			: [];

		const errors = Array.isArray(description?.errors)
			? description.errors
			: [];

		const messages = [
			description?.message,
			description?.error,
			...warnings,
			...errors,
		].filter(Boolean);

		if (messages.length) {
			return messages.map((message: any) =>
				this.normalizeImportWarningMessage(message),
			);
		}

		return [];
	}

	private normalizeImportDescriptions(description: any): any[] {
		if (Array.isArray(description)) {
			return description;
		}

		return description ? [description] : [];
	}

	private normalizeImportWarningMessage(message: any): string {
		return typeof message === 'string' ? message : JSON.stringify(message);
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
