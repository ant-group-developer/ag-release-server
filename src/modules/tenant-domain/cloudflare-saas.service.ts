import { Injectable, Logger } from '@nestjs/common';

export interface CfCustomHostnameResult {
	id: string;
	hostname: string;
	status: string;
	ssl: {
		status: string;
	} | null;
	ownership_verification: {
		type: string;
		name: string;
		value: string;
	} | null;
}

@Injectable()
export class CloudflareSaasService {
	private readonly logger = new Logger(CloudflareSaasService.name);
	private readonly baseUrl = 'https://api.cloudflare.com/client/v4';

	private get zoneId(): string {
		return process.env.CF_ZONE_ID!;
	}

	private get headers(): Record<string, string> {
		return {
			Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
			'Content-Type': 'application/json',
		};
	}

	async createCustomHostname(
		hostname: string,
	): Promise<CfCustomHostnameResult> {
		const res = await fetch(
			`${this.baseUrl}/zones/${this.zoneId}/custom_hostnames`,
			{
				method: 'POST',
				headers: this.headers,
				body: JSON.stringify({
					hostname,
					ssl: {
						method: 'http',
						type: 'dv',
						settings: {
							min_tls_version: '1.2',
						},
					},
				}),
			},
		);

		const json = await res.json();
		if (!json.success) {
			// 1406 = "Duplicate custom hostname found": hostname đã tồn tại trên Cloudflare
			// (vd record mồ côi từ lần add trước chưa xóa). Adopt lại thay vì crash.
			const isDuplicate = json.errors?.some(
				(e: { code: number }) => e.code === 1406,
			);
			if (isDuplicate) {
				this.logger.warn(
					`CF createCustomHostname: ${hostname} already exists, adopting existing record`,
				);
				const existing = await this.getCustomHostnameByName(hostname);
				if (existing) return existing;
				// Không tìm thấy dù CF báo trùng — fall through để báo lỗi gốc
				this.logger.error(
					`CF createCustomHostname: duplicate reported but lookup failed for ${hostname}`,
				);
			}
			this.logger.error(
				`CF createCustomHostname failed for ${hostname}`,
				json.errors,
			);
			throw new Error(
				`Cloudflare error: ${json.errors?.[0]?.message ?? 'unknown'}`,
			);
		}

		return json.result as CfCustomHostnameResult;
	}

	/** Tìm custom hostname theo tên (dùng để adopt khi gặp duplicate). Trả null nếu không có. */
	async getCustomHostnameByName(
		hostname: string,
	): Promise<CfCustomHostnameResult | null> {
		const res = await fetch(
			`${this.baseUrl}/zones/${this.zoneId}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`,
			{ headers: this.headers },
		);

		const json = await res.json();
		if (!json.success) {
			this.logger.error(
				`CF getCustomHostnameByName failed for ${hostname}`,
				json.errors,
			);
			return null;
		}

		const match = (json.result as CfCustomHostnameResult[]).find(
			(h) => h.hostname === hostname,
		);
		return match ?? json.result?.[0] ?? null;
	}

	async getHostnameStatus(
		cfCustomHostnameId: string,
	): Promise<CfCustomHostnameResult> {
		const res = await fetch(
			`${this.baseUrl}/zones/${this.zoneId}/custom_hostnames/${cfCustomHostnameId}`,
			{ headers: this.headers },
		);

		const json = await res.json();
		if (!json.success) {
			this.logger.error(
				`CF getHostnameStatus failed for ${cfCustomHostnameId}`,
				json.errors,
			);
			throw new Error(
				`Cloudflare error: ${json.errors?.[0]?.message ?? 'unknown'}`,
			);
		}

		return json.result as CfCustomHostnameResult;
	}

	async deleteCustomHostname(cfCustomHostnameId: string): Promise<void> {
		const res = await fetch(
			`${this.baseUrl}/zones/${this.zoneId}/custom_hostnames/${cfCustomHostnameId}`,
			{
				method: 'DELETE',
				headers: this.headers,
			},
		);

		const json = await res.json();
		if (!json.success) {
			this.logger.warn(
				`CF deleteCustomHostname failed for ${cfCustomHostnameId}`,
				json.errors,
			);
		}
	}
}
