import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../tenant/tenant.entity';
import { CloudflareDnsOAuthService } from './cloudflare-dns-oauth.service';
import { CloudflareSaasService } from './cloudflare-saas.service';
import { DomainHealthCron } from './domain-health.cron';
import { TenantDomain } from './entities/tenant-domain.entity';
import { TenantDomainController } from './tenant-domain.controller';
import { TenantDomainService } from './tenant-domain.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([TenantDomain, Tenant]),
	],
	controllers: [TenantDomainController],
	providers: [
		TenantDomainService,
		CloudflareSaasService,
		CloudflareDnsOAuthService,
		DomainHealthCron,
	],
	exports: [TenantDomainService],
})
export class TenantDomainModule {}
