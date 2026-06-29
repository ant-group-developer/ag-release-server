import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Query,
	Redirect,
	Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ResponseSuccess } from '../../common/dtos/common.response.dto';
import { PublicRoute, TenantOwnerOrAdminOnly } from '../auth/decorators/auth.decorator';
import { AddDomainDto, CfOAuthCallbackDto, GetCfOAuthUrlDto } from './dtos/tenant-domain.dto';
import { TenantDomainService } from './tenant-domain.service';

@ApiTags('Tenant Domain')
@Controller()
export class TenantDomainController {
	constructor(private readonly tenantDomainService: TenantDomainService) {}

	// ─── Authenticated routes ─────────────────────────────────────────────────

	@TenantOwnerOrAdminOnly()
	@Get('tenants/:tenantId/domain')
	@ApiOperation({ summary: 'Get custom domain of tenant' })
	async getDomain(@Param('tenantId') tenantId: string) {
		const data = await this.tenantDomainService.getDomain(tenantId);
		return new ResponseSuccess({ data });
	}

	@TenantOwnerOrAdminOnly()
	@Post('tenants/:tenantId/domain')
	@ApiOperation({ summary: 'Add custom domain to tenant' })
	async addDomain(
		@Param('tenantId') tenantId: string,
		@Body() dto: AddDomainDto,
	) {
		const data = await this.tenantDomainService.addDomain(tenantId, dto.domain);
		return new ResponseSuccess({ data });
	}

	@TenantOwnerOrAdminOnly()
	@Post('tenants/:tenantId/domain/verify')
	@ApiOperation({ summary: 'Trigger domain verification check' })
	async verifyDomain(@Param('tenantId') tenantId: string) {
		const data = await this.tenantDomainService.verifyDomain(tenantId);
		return new ResponseSuccess({ data });
	}

	@TenantOwnerOrAdminOnly()
	@Delete('tenants/:tenantId/domain')
	@ApiOperation({ summary: 'Remove custom domain from tenant' })
	async removeDomain(@Param('tenantId') tenantId: string) {
		await this.tenantDomainService.removeDomain(tenantId);
		return new ResponseSuccess({ data: null });
	}

	@TenantOwnerOrAdminOnly()
	@Get('tenants/:tenantId/domain/cf-oauth-url')
	@ApiOperation({ summary: 'Get Cloudflare OAuth URL for auto DNS setup — uses domain already saved in DB' })
	async getCfOAuthUrl(@Param('tenantId') tenantId: string) {
		const url = await this.tenantDomainService.getCfOAuthUrl(tenantId);
		return new ResponseSuccess({ data: { url } });
	}

	// ─── Public routes ────────────────────────────────────────────────────────

	@PublicRoute()
	@Get('public/domain-resolve')
	@ApiOperation({ summary: 'Resolve custom domain to tenant branding' })
	async resolveDomain(@Query('domain') domain: string) {
		const data = await this.tenantDomainService.resolveDomain(domain);
		return new ResponseSuccess({ data });
	}

	@PublicRoute()
	@Get('public/cf-oauth-callback')
	@ApiOperation({ summary: 'Cloudflare OAuth callback — exchanges code and adds DNS records' })
	@Redirect()
	async cfOAuthCallback(@Query() query: CfOAuthCallbackDto) {
		if (query.error) {
			const redirectUrl = await this.tenantDomainService.getCfOAuthErrorRedirectUrl(
				query.state,
				query.error,
				query.error_description,
			);
			return { url: redirectUrl };
		}
		const redirectUrl = await this.tenantDomainService.handleCfOAuthCallback(
			query.code,
			query.state,
		);
		return { url: redirectUrl };
	}
}
