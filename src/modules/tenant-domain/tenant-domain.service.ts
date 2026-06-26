import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { ResponseError } from '../../common/dtos/common.response.dto';
import { Tenant } from '../tenant/tenant.entity';
import { CloudflareDnsOAuthService } from './cloudflare-dns-oauth.service';
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

@Injectable()
export class TenantDomainService {
	private readonly logger = new Logger(TenantDomainService.name);

	// in-memory cache: domain → { data, expiresAt }
	private readonly resolveCache = new Map<string, { data: TenantBranding | null; expiresAt: number }>();
	private readonly CACHE_TTL_MS = 5 * 60 * 1000;

	// CSRF state store: state → { tenantId, domain, expiresAt }
	private readonly oauthStateStore = new Map<string, { tenantId: string; domain: string; expiresAt: number }>();

	constructor(
		@InjectRepository(TenantDomain)
		private readonly repo: Repository<TenantDomain>,
		@InjectRepository(Tenant)
		private readonly tenantRepo: Repository<Tenant>,
		private readonly cfSaasService: CloudflareSaasService,
		private readonly cfDnsOAuthService: CloudflareDnsOAuthService,
	) {}

	// ─── Queries ───────────────────────────────────────────────────────────────

	async getDomain(tenantId: string): Promise<{ domain: TenantDomain; dnsInstructions: DnsInstructions } | null> {
		const domain = await this.repo.findOne({ where: { tenantId } });
		if (!domain) return null;
		return {
			domain,
			dnsInstructions: this.buildDnsInstructions(domain),
		};
	}

	async findActiveByDomain(domain: string): Promise<TenantDomain | null> {
		return this.repo.findOne({ where: { domain, status: DomainStatus.ACTIVE } });
	}

	// ─── Add Domain ────────────────────────────────────────────────────────────

	async addDomain(tenantId: string, domain: string): Promise<{ domain: TenantDomain; dnsInstructions: DnsInstructions }> {
		this.validateDomainFormat(domain);

		const existing = await this.repo.findOne({ where: { tenantId } });
		if (existing) {
			throw new ResponseError(TenantDomainMessages.ALREADY_HAS_DOMAIN);
		}

		const taken = await this.repo.findOne({ where: { domain } });
		if (taken) {
			throw new ResponseError(TenantDomainMessages.DOMAIN_TAKEN);
		}

		const cfResult = await this.cfSaasService.createCustomHostname(domain);

		const entity = this.repo.create({
			domain,
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

	async resolveDomain(domain: string): Promise<TenantBranding | null> {
		const now = Date.now();
		const cached = this.resolveCache.get(domain);
		if (cached && cached.expiresAt > now) return cached.data;

		const record = await this.repo.findOne({
			where: { domain, status: DomainStatus.ACTIVE },
			relations: ['tenant'],
		});

		const data: TenantBranding | null = record
			? {
					tenantId: record.tenantId,
					name: record.tenant.name,
					title: record.tenant.title,
					logo: record.tenant.logo,
					icon: record.tenant.icon,
					primaryColor: record.tenant.primaryColor,
			  }
			: null;

		this.resolveCache.set(domain, { data, expiresAt: now + this.CACHE_TTL_MS });
		return data;
	}

	// ─── Cloudflare OAuth ──────────────────────────────────────────────────────

	getCfOAuthUrl(tenantId: string, domain: string): string {
		const state = crypto.randomUUID();
		this.oauthStateStore.set(state, {
			tenantId,
			domain,
			expiresAt: Date.now() + 10 * 60 * 1000, // 10 min TTL
		});

		const params = new URLSearchParams({
			client_id: process.env.CF_OAUTH_CLIENT_ID!,
			redirect_uri: process.env.CF_OAUTH_REDIRECT_URI!,
			response_type: 'code',
			scope: 'account:read zone:read dns:edit',
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

		// Redirect FE về settings page với success flag
		const frontendUrl = process.env.FRONTEND_URL ?? 'https://release.antmusic.net';
		return `${frontendUrl}/settings/domain?cf_setup=success`;
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
		this.resolveCache.delete(domain);
	}
}
