import { Injectable, Logger } from '@nestjs/common';

interface CfTokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
}

interface CfZone {
	id: string;
	name: string;
}

/**
 * Lỗi có cấu trúc cho luồng OAuth của Cloudflare.
 * `code` được map ra query param `cf_error` để FE hiển thị thông báo phù hợp.
 */
export class CfOAuthError extends Error {
	constructor(
		public readonly code: string,
		public readonly description?: string,
	) {
		super(description ? `${code}: ${description}` : code);
		this.name = 'CfOAuthError';
	}
}

@Injectable()
export class CloudflareDnsOAuthService {
	private readonly logger = new Logger(CloudflareDnsOAuthService.name);
	private readonly baseUrl = 'https://api.cloudflare.com/client/v4';

	async exchangeCode(code: string): Promise<CfTokenResponse> {
		// Dùng api.cloudflare.com thay vì dash.cloudflare.com: host dash bật managed bot
		// challenge (trả HTML "Just a moment...") cho request từ IP datacenter, còn host
		// api không challenge và serve cùng token endpoint.
		const res = await fetch('https://api.cloudflare.com/oauth2/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Accept: 'application/json',
			},
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: process.env.CF_OAUTH_REDIRECT_URI!,
				client_id: process.env.CF_OAUTH_CLIENT_ID!,
				client_secret: process.env.CF_OAUTH_CLIENT_SECRET!,
			}),
		});

		if (!res.ok) {
			const text = await res.text();
			this.logger.error('CF OAuth token exchange failed', text);

			// Cloudflare trả trang managed challenge (HTML) thay vì JSON khi nghi request là bot.
			// Thường xảy ra khi server chạy trên IP datacenter.
			const isChallenge =
				text.includes('Just a moment') ||
				text.includes('challenge-platform') ||
				text.trimStart().startsWith('<!DOCTYPE html');
			if (isChallenge) {
				throw new CfOAuthError(
					'token_exchange_blocked',
					'Cloudflare blocked the token request with a bot challenge. The server IP may be flagged; contact support.',
				);
			}

			let description: string | undefined;
			try {
				description = JSON.parse(text)?.error_description;
			} catch {
				// body không phải JSON — bỏ qua, dùng description mặc định
			}
			throw new CfOAuthError(
				'token_exchange_failed',
				description ?? 'Failed to exchange Cloudflare OAuth code',
			);
		}

		return res.json();
	}

	async getZoneId(accessToken: string, domain: string): Promise<string> {
		// Extract root domain: "release.betamusic.net" → "betamusic.net"
		const parts = domain.split('.');
		const rootDomain = parts.slice(-2).join('.');

		const res = await fetch(
			`${this.baseUrl}/zones?name=${encodeURIComponent(rootDomain)}`,
			{
				headers: {
					Authorization: `Bearer ${accessToken}`,
					'Content-Type': 'application/json',
				},
			},
		);

		const json = await res.json();
		if (!json.success || !json.result?.length) {
			this.logger.error(
				`CF getZoneId: no zone found for ${rootDomain}`,
				json.errors,
			);
			throw new CfOAuthError(
				'zone_not_found',
				`No Cloudflare zone found for "${rootDomain}". The authorized Cloudflare account must manage this domain.`,
			);
		}

		const zone = json.result[0] as CfZone;
		return zone.id;
	}

	async addDnsRecords(
		accessToken: string,
		zoneId: string,
		opts: {
			domain: string;
			cnameTarget: string;
			txtName: string;
			txtValue: string;
		},
	): Promise<void> {
		const authHeader = {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
		};

		const [cnameRes, txtRes] = await Promise.all([
			fetch(`${this.baseUrl}/zones/${zoneId}/dns_records`, {
				method: 'POST',
				headers: authHeader,
				body: JSON.stringify({
					type: 'CNAME',
					name: opts.domain,
					content: opts.cnameTarget,
					ttl: 1,
					proxied: false,
				}),
			}),
			fetch(`${this.baseUrl}/zones/${zoneId}/dns_records`, {
				method: 'POST',
				headers: authHeader,
				body: JSON.stringify({
					type: 'TXT',
					name: opts.txtName,
					content: opts.txtValue,
					ttl: 1,
				}),
			}),
		]);

		const [cnameJson, txtJson] = await Promise.all([
			cnameRes.json(),
			txtRes.json(),
		]);

		if (!cnameJson.success) {
			this.logger.error(
				`CF addDnsRecords: CNAME failed for ${opts.domain}`,
				cnameJson.errors,
			);
			throw this.toDnsError(cnameJson.errors, 'CNAME', opts.domain);
		}

		if (!txtJson.success) {
			this.logger.error(
				`CF addDnsRecords: TXT failed for ${opts.txtName}`,
				txtJson.errors,
			);
			throw this.toDnsError(txtJson.errors, 'TXT', opts.txtName);
		}
	}

	/**
	 * Map lỗi từ Cloudflare DNS API thành CfOAuthError.
	 * Code 81053 = record (A/AAAA/CNAME) đã tồn tại với host đó.
	 */
	private toDnsError(
		errors: Array<{ code: number; message: string }> | undefined,
		recordType: 'CNAME' | 'TXT',
		host: string,
	): CfOAuthError {
		const first = errors?.[0];
		if (
			first?.code === 81053 ||
			first?.code === 81057 ||
			first?.code === 81058
		) {
			return new CfOAuthError(
				'record_exists',
				`A ${recordType} record for "${host}" already exists in this zone. Please review the existing DNS records.`,
			);
		}
		return new CfOAuthError(
			'dns_add_failed',
			first?.message ?? `Failed to add ${recordType} record`,
		);
	}
}
