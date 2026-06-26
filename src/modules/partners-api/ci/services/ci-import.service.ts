import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { GetCiImportsDto } from '../dtos/ci-import.dto';

export interface CiImportSimpleItem {
	status?: string;
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
					order_by: 'modify_time_desc',
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
			status: item?.status,
			modify_time: item?.modify_time,
			errors: this.getImportWarnings(item),
		}));
	}

	private getImportWarnings(item: any): string[] {
		const importFiles = Array.isArray(item?.import_file)
			? item.import_file
			: [];

		return importFiles.flatMap((file: any) => {
			const descriptions = Array.isArray(file?.description)
				? file.description
				: file?.description
					? [file.description]
					: [];

			return descriptions.flatMap((description: any) => {
				const warnings = Array.isArray(description?.warnings)
					? description.warnings
					: [];

				return warnings.map((warning: any) =>
					typeof warning === 'string'
						? warning
						: JSON.stringify(warning),
				);
			});
		});
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
