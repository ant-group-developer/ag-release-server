import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { isPrimaryDomain, normalizeDomain, getPrimaryDomains } from 'src/common/config/domain.config';
import { Repository } from 'typeorm';
import { ResponseError } from '../../common/dtos/common.response.dto';
import { Tenant } from '../tenant/tenant.entity';
import { CfOAuthError, CloudflareDnsOAuthService } from './cloudflare-dns-oauth.service';
import { CloudflareSaasService } from './cloudflare-saas.service';
import { TenantDomainMessages } from './tenant-domain.constants';
import { DomainSetupMode, DomainStatus, SslStatus, TenantDomain } from './entities/tenant-domain.entity';

export interface TenantBranding {
	tenantId: string;
	name: string | null;
	title: string | null;
	logo: string | null;
	icon: string | null;
	primaryColor: string | null;
}

export interface DnsInstructions {
	cnameRecord: { type: 'CNAME'; name: string; value: string };
	txtRecord: { type: 'TXT'; name: string; value: string };
}

export interface DomainResolveResult {
	isPrimaryDomain: boolean;
	domain: string;
	tenant: TenantBranding | null;
}

@Injectable()
export class TenantDomainService {
	private readonly logger = new Logger(TenantDomainService.name);

	// in-memory cache: domain → { data, expiresAt }
	private readonly resolveCache = new Map<string, { data: DomainResolveResult; expiresAt: number }>();
	private readonly CACHE_TTL_MS = 5 * 60 * 1000;

	// CSRF state store: state → { tenantId, domain, returnUrl, expiresAt }
	// returnUrl: full URL đã validate để redirect về sau khi xong (rỗng → fallback primary)
	private readonly oauthStateStore = new Map<string, { tenantId: string; domain: string; returnUrl: string; expiresAt: number }>();

	constructor(
		@InjectRepository(TenantDomain)
		private readonly repo: Repository<TenantDomain>,
		@InjectRepository(Tenant)
		private readonly tenantRepo: Repository<Tenant>,
		private readonly cfSaasService: CloudflareSaasService,
		private readonly cfDnsOAuthService: CloudflareDnsOAuthService,
	) {}

	// ─── Queries ───────────────────────────────────────────────────────────────

	async getDomain(tenantId: string): Promise<{ domain: TenantDomain; dnsInstructions: DnsInstructions; canAutoSetup: boolean } | null> {
		const domain = await this.repo.findOne({ where: { tenantId } });
		if (!domain) return null;
		return {
			domain,
			dnsInstructions: this.buildDnsInstructions(domain),
			canAutoSetup: this.canAutoSetup(domain.status),
		};
	}

	/**
	 * Auto-setup (Connect Cloudflare) chỉ có ý nghĩa khi DNS chưa hoàn thiện.
	 * Khi domain đã active/verifying thì DNS đã đúng → không cần auto-setup nữa.
	 */
	private canAutoSetup(status: DomainStatus): boolean {
		return (
			status === DomainStatus.PENDING ||
			status === DomainStatus.FAILED ||
			status === DomainStatus.EXPIRED
		);
	}

	async findActiveByDomain(domain: string): Promise<TenantDomain | null> {
		return this.repo.findOne({
			where: { domain: normalizeDomain(domain), status: DomainStatus.ACTIVE },
		});
	}

	// ─── Add Domain ────────────────────────────────────────────────────────────

	async addDomain(tenantId: string, domain: string): Promise<{ domain: TenantDomain; dnsInstructions: DnsInstructions }> {
		const normalizedDomain = normalizeDomain(domain);
		this.validateDomainFormat(normalizedDomain);

		const existing = await this.repo.findOne({ where: { tenantId } });
		if (existing) {
			throw new ResponseError(TenantDomainMessages.ALREADY_HAS_DOMAIN);
		}

		const taken = await this.repo.findOne({ where: { domain: normalizedDomain } });
		if (taken) {
			throw new ResponseError(TenantDomainMessages.DOMAIN_TAKEN);
		}

		const cfResult = await this.cfSaasService.createCustomHostname(normalizedDomain);

		const entity = this.repo.create({
			domain: normalizedDomain,
			tenantId,
			status: DomainStatus.PENDING,
			setupMode: DomainSetupMode.MANUAL,
			cfCustomHostnameId: cfResult.id,
			verificationToken: cfResult.ownership_verification?.value ?? crypto.randomUUID(),
			sslStatus: SslStatus.PENDING,
		});

		const saved = await this.repo.save(entity);
		return {
			domain: saved,
			dnsInstructions: this.buildDnsInstructions(saved),
		};
	}

	// ─── Verify Domain ─────────────────────────────────────────────────────────

	async verifyDomain(tenantId: string): Promise<TenantDomain> {
		const domain = await this.repo.findOne({ where: { tenantId } });
		if (!domain) {
			throw new ResponseError(TenantDomainMessages.NOT_FOUND);
		}

		if (!domain.cfCustomHostnameId) {
			throw new BadRequestException('Domain has no Cloudflare hostname ID');
		}

		const cfStatus = await this.cfSaasService.getHostnameStatus(domain.cfCustomHostnameId);

		domain.lastCheckedAt = new Date();
		domain.lastCheckResult = cfStatus as unknown as Record<string, any>;

		const dnsVerified = cfStatus.status === 'active';
		const sslActive = cfStatus.ssl?.status === 'active';

		if (dnsVerified && sslActive) {
			domain.status = DomainStatus.ACTIVE;
			domain.sslStatus = SslStatus.ACTIVE;
			domain.verifiedAt = new Date();
			domain.sslActiveAt = new Date();

			// Sync backward to Tenant.domain for legacy compatibility
			await this.tenantRepo.update(tenantId, { domain: domain.domain });
			this.invalidateDomainCache(domain.domain);
		} else if (dnsVerified) {
			domain.status = DomainStatus.VERIFYING;
			domain.sslStatus = SslStatus.INITIALIZING;
		} else {
			domain.status = DomainStatus.FAILED;
		}

		return this.repo.save(domain);
	}

	// ─── Remove Domain ─────────────────────────────────────────────────────────

	async removeDomain(tenantId: string): Promise<void> {
		const domain = await this.repo.findOne({ where: { tenantId } });
		if (!domain) return;

		if (domain.cfCustomHostnameId) {
			await this.cfSaasService.deleteCustomHostname(domain.cfCustomHostnameId)
				.catch((err) => this.logger.warn(`CF delete failed for ${domain.domain}: ${err.message}`));
		}

		await this.repo.remove(domain);
		await this.tenantRepo.update(tenantId, { domain: undefined });
		this.invalidateDomainCache(domain.domain);
	}

	// ─── Resolve Domain (Public, with cache) ──────────────────────────────────

	async resolveDomain(domain: string): Promise<DomainResolveResult> {
		const normalizedDomain = normalizeDomain(domain);
		if (isPrimaryDomain(normalizedDomain)) {
			return {
				isPrimaryDomain: true,
				domain: normalizedDomain,
				tenant: null,
			};
		}

		const now = Date.now();
		const cached = this.resolveCache.get(normalizedDomain);
		if (cached && cached.expiresAt > now) return cached.data;

		const record = await this.repo.findOne({
			where: { domain: normalizedDomain, status: DomainStatus.ACTIVE },
			relations: ['tenant'],
		});

		const tenant: TenantBranding | null = record
			? {
					tenantId: record.tenantId,
					name: record.tenant.name,
					title: record.tenant.title,
					logo: record.tenant.logo,
					icon: record.tenant.icon,
					primaryColor: record.tenant.primaryColor,
			  }
			: null;

		const data = {
			isPrimaryDomain: false,
			domain: normalizedDomain,
			tenant,
		};
		this.resolveCache.set(normalizedDomain, { data, expiresAt: now + this.CACHE_TTL_MS });
		return data;
	}

	// ─── Cloudflare OAuth ──────────────────────────────────────────────────────

	async getCfOAuthUrl(tenantId: string, opts?: { returnUrl?: string; requestOrigin?: string }): Promise<string> {
		const domainRecord = await this.repo.findOne({ where: { tenantId } });
		if (!domainRecord) {
			throw new ResponseError(TenantDomainMessages.NOT_FOUND);
		}

		// Chặn double-submit: domain đã active/verifying thì DNS đã đúng rồi
		if (!this.canAutoSetup(domainRecord.status)) {
			throw new ResponseError(TenantDomainMessages.CF_OAUTH_NOT_AVAILABLE);
		}

		// Ưu tiên returnUrl FE gửi (về đúng trang đang config); fallback origin header.
		const returnUrl = await this.resolveSafeReturnUrl(opts?.returnUrl, opts?.requestOrigin);

		const state = crypto.randomUUID();
		this.oauthStateStore.set(state, {
			tenantId,
			domain: domainRecord.domain,
			returnUrl,
			expiresAt: Date.now() + 10 * 60 * 1000,
		});

		const params = new URLSearchParams({
			client_id: process.env.CF_OAUTH_CLIENT_ID!,
			redirect_uri: process.env.CF_OAUTH_REDIRECT_URI!,
			response_type: 'code',
			scope: 'zone.read dns.write',
			state,
		});

		return `https://dash.cloudflare.com/oauth2/auth?${params}`;
	}

	async handleCfOAuthCallback(code: string, state: string): Promise<string> {
		const stateData = this.oauthStateStore.get(state);
		if (!stateData || stateData.expiresAt < Date.now()) {
			this.oauthStateStore.delete(state);
			throw new ResponseError(TenantDomainMessages.CF_OAUTH_INVALID_STATE);
		}
		this.oauthStateStore.delete(state);

		const { tenantId, domain } = stateData;

		const domainRecord = await this.repo.findOne({ where: { tenantId } });
		if (!domainRecord) {
			throw new ResponseError(TenantDomainMessages.NOT_FOUND);
		}

		const { access_token } = await this.cfDnsOAuthService.exchangeCode(code);
		const zoneId = await this.cfDnsOAuthService.getZoneId(access_token, domain);

		await this.cfDnsOAuthService.addDnsRecords(access_token, zoneId, {
			domain,
			cnameTarget: process.env.CF_FALLBACK_ORIGIN ?? 'cname.antmusic.net',
			txtName: `_cf-custom-hostname.${domain}`,
			txtValue: domainRecord.verificationToken ?? '',
		});

		await this.repo.update(domainRecord.id, {
			setupMode: DomainSetupMode.CLOUDFLARE_AUTO,
			cfTenantZoneId: zoneId,
		});

		// Redirect về đúng URL admin bắt đầu flow (đã validate ở getCfOAuthUrl)
		return this.appendSetupParams(stateData.returnUrl, { cf_setup: 'success' });
	}

	/**
	 * Peek returnUrl đã lưu trong state (KHÔNG xóa state — để handleCfOAuthCallback
	 * tự xóa khi xử lý). Trả '' nếu state không tồn tại/hết hạn → fallback primary.
	 */
	resolveCallbackReturnUrl(state: string): string {
		const stateData = this.oauthStateStore.get(state);
		if (!stateData || stateData.expiresAt < Date.now()) return '';
		return stateData.returnUrl;
	}

	buildOAuthErrorRedirect(returnUrl: string, error: string, errorDescription?: string): string {
		const params: Record<string, string> = { cf_setup: 'error', cf_error: error };
		if (errorDescription) params.cf_error_description = errorDescription;
		return this.appendSetupParams(returnUrl, params);
	}

	/**
	 * Validate returnUrl FE gửi: chỉ chấp nhận khi origin của nó là primary domain
	 * hoặc custom domain đang ACTIVE (chống open-redirect). Giữ nguyên path + query
	 * của FE để về đúng trang đang config. Nếu returnUrl không hợp lệ/không có thì
	 * thử origin header; cuối cùng trả '' → fallback primary lúc redirect.
	 */
	private async resolveSafeReturnUrl(returnUrl?: string, requestOrigin?: string): Promise<string> {
		// 1. Thử returnUrl FE gửi (giữ full path để về đúng trang)
		if (returnUrl) {
			try {
				const parsed = new URL(returnUrl);
				// Dùng host (gồm port) cho khớp cách normalizeDomain/primaryDomains giữ port
				if (await this.isAllowedHost(parsed.host)) {
					// Bỏ hash + các param cf_setup cũ (nếu có) để tránh trùng
					parsed.hash = '';
					parsed.searchParams.delete('cf_setup');
					parsed.searchParams.delete('cf_error');
					parsed.searchParams.delete('cf_error_description');
					return parsed.toString();
				}
				this.logger.warn(`CF OAuth: rejected unsafe returnUrl host "${parsed.host}"`);
			} catch {
				this.logger.warn(`CF OAuth: invalid returnUrl "${returnUrl}"`);
			}
		}

		// 2. Fallback: origin header (chỉ có host, dùng path mặc định /settings/domain)
		const host = normalizeDomain(requestOrigin);
		if (host && (await this.isAllowedHost(host))) {
			return `https://${host}/settings/domain`;
		}

		return '';
	}

	/** Host hợp lệ = primary domain hoặc custom domain đang ACTIVE. */
	private async isAllowedHost(hostname: string): Promise<boolean> {
		const host = normalizeDomain(hostname);
		if (!host) return false;
		if (isPrimaryDomain(host)) return true;
		const active = await this.repo.findOne({ where: { domain: host, status: DomainStatus.ACTIVE } });
		return !!active;
	}

	/**
	 * Gắn các param cf_setup/cf_error vào returnUrl (giữ nguyên path + query sẵn có).
	 * returnUrl rỗng → fallback PRIMARY_DOMAINS[0]/settings/domain.
	 */
	private appendSetupParams(returnUrl: string, params: Record<string, string>): string {
		const base = returnUrl || this.defaultReturnUrl();
		try {
			const url = new URL(base);
			for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
			return url.toString();
		} catch {
			// base không parse được (không nên xảy ra) → ghép thủ công
			const qs = new URLSearchParams(params).toString();
			return `${this.defaultReturnUrl()}?${qs}`;
		}
	}

	private defaultReturnUrl(): string {
		const primaryDomains = getPrimaryDomains();
		const origin = primaryDomains.length > 0 ? `https://${primaryDomains[0]}` : 'https://localhost:3000';
		return `${origin}/settings/domain`;
	}

	/**
	 * Map exception từ handleCfOAuthCallback thành { code, description } để
	 * controller redirect về FE với cf_error tương ứng.
	 */
	mapCfCallbackError(err: unknown): { code: string; description?: string } {
		if (err instanceof CfOAuthError) {
			return { code: err.code, description: err.description };
		}
		if (err instanceof ResponseError) {
			// Hiện tại chỉ có CF_OAUTH_INVALID_STATE / NOT_FOUND đi qua đây
			const messageCode = err.messageCode;
			if (messageCode === TenantDomainMessages.CF_OAUTH_INVALID_STATE.messageCode) {
				return { code: 'oauth_invalid_state', description: TenantDomainMessages.CF_OAUTH_INVALID_STATE.message };
			}
			if (messageCode === TenantDomainMessages.NOT_FOUND.messageCode) {
				return { code: 'domain_not_found', description: TenantDomainMessages.NOT_FOUND.message };
			}
			return { code: 'setup_failed', description: err.message };
		}
		this.logger.error('Unexpected CF OAuth callback error', err as any);
		return { code: 'setup_failed', description: 'Unexpected error while completing Cloudflare setup' };
	}

	// ─── Health Check (called by cron) ─────────────────────────────────────────

	async checkDomainHealth(domain: TenantDomain): Promise<void> {
		if (!domain.cfCustomHostnameId) return;

		try {
			const cfStatus = await this.cfSaasService.getHostnameStatus(domain.cfCustomHostnameId);
			domain.lastCheckedAt = new Date();
			domain.lastCheckResult = cfStatus as unknown as Record<string, any>;

			if (cfStatus.status !== 'active' && domain.status === DomainStatus.ACTIVE) {
				domain.status = DomainStatus.EXPIRED;
				await this.tenantRepo.update(domain.tenantId, { domain: undefined });
				this.invalidateDomainCache(domain.domain);
				// TODO: emit notification event to tenant admin
			}

			await this.repo.save(domain);
		} catch (err: any) {
			this.logger.warn(`Health check failed for domain ${domain.domain}: ${err.message}`);
		}
	}

	// ─── Helpers ───────────────────────────────────────────────────────────────

	private validateDomainFormat(domain: string): void {
		const reserved = /antmusic\.net$/i;
		const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
		const validDomain = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

		if (reserved.test(domain)) {
			throw new ResponseError({ ...TenantDomainMessages.INVALID_DOMAIN_FORMAT, message: 'Cannot use antmusic.net subdomains' });
		}
		if (ipPattern.test(domain)) {
			throw new ResponseError({ ...TenantDomainMessages.INVALID_DOMAIN_FORMAT, message: 'IP addresses are not allowed' });
		}
		if (domain === 'localhost' || domain.endsWith('.localhost')) {
			throw new ResponseError({ ...TenantDomainMessages.INVALID_DOMAIN_FORMAT, message: 'localhost is not allowed' });
		}
		if (!validDomain.test(domain)) {
			throw new ResponseError(TenantDomainMessages.INVALID_DOMAIN_FORMAT);
		}
	}

	private buildDnsInstructions(domain: TenantDomain): DnsInstructions {
		return {
			cnameRecord: {
				type: 'CNAME',
				name: domain.domain,
				value: process.env.CF_FALLBACK_ORIGIN ?? 'cname.antmusic.net',
			},
			txtRecord: {
				type: 'TXT',
				name: `_cf-custom-hostname.${domain.domain}`,
				value: domain.verificationToken ?? '',
			},
		};
	}

	private invalidateDomainCache(domain: string): void {
		this.resolveCache.delete(normalizeDomain(domain));
	}
}
