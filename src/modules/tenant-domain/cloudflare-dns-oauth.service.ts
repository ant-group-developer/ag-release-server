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

@Injectable()
export class CloudflareDnsOAuthService {
	private readonly logger = new Logger(CloudflareDnsOAuthService.name);
	private readonly baseUrl = 'https://api.cloudflare.com/client/v4';

	async exchangeCode(code: string): Promise<CfTokenResponse> {
		const res = await fetch('https://dash.cloudflare.com/oauth2/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
			throw new Error('Failed to exchange Cloudflare OAuth code');
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
			this.logger.error(`CF getZoneId: no zone found for ${rootDomain}`, json.errors);
			throw new Error(`No Cloudflare zone found for domain: ${rootDomain}`);
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

		const [cnameJson, txtJson] = await Promise.all([cnameRes.json(), txtRes.json()]);

		if (!cnameJson.success) {
			this.logger.error(`CF addDnsRecords: CNAME failed for ${opts.domain}`, cnameJson.errors);
			throw new Error(`Failed to add CNAME record: ${cnameJson.errors?.[0]?.message ?? 'unknown'}`);
		}

		if (!txtJson.success) {
			this.logger.error(`CF addDnsRecords: TXT failed for ${opts.txtName}`, txtJson.errors);
			throw new Error(`Failed to add TXT record: ${txtJson.errors?.[0]?.message ?? 'unknown'}`);
		}
	}
}
