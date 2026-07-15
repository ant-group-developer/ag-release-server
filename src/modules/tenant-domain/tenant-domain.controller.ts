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
import {
	PublicRoute,
	TenantOwnerOrAdminOnly,
	TenantWhiteLabelOnly,
} from '../auth/decorators/auth.decorator';
import {
	AddDomainDto,
	CfOAuthCallbackDto,
	CfOAuthUrlQueryDto,
} from './dtos/tenant-domain.dto';
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

	@TenantWhiteLabelOnly()
	@TenantOwnerOrAdminOnly()
	@Post('tenants/:tenantId/domain')
	@ApiOperation({ summary: 'Add custom domain to tenant' })
	async addDomain(
		@Param('tenantId') tenantId: string,
		@Body() dto: AddDomainDto,
	) {
		const data = await this.tenantDomainService.addDomain(
			tenantId,
			dto.domain,
		);
		return new ResponseSuccess({ data });
	}

	@TenantWhiteLabelOnly()
	@TenantOwnerOrAdminOnly()
	@Post('tenants/:tenantId/domain/verify')
	@ApiOperation({ summary: 'Trigger domain verification check' })
	async verifyDomain(@Param('tenantId') tenantId: string) {
		const data = await this.tenantDomainService.verifyDomain(tenantId);
		return new ResponseSuccess({ data });
	}

	@TenantWhiteLabelOnly()
	@TenantOwnerOrAdminOnly()
	@Delete('tenants/:tenantId/domain')
	@ApiOperation({ summary: 'Remove custom domain from tenant' })
	async removeDomain(@Param('tenantId') tenantId: string) {
		await this.tenantDomainService.removeDomain(tenantId);
		return new ResponseSuccess({ data: null });
	}

	@TenantWhiteLabelOnly()
	@TenantOwnerOrAdminOnly()
	@Get('tenants/:tenantId/domain/cf-oauth-url')
	@ApiOperation({
		summary:
			'Get Cloudflare OAuth URL for auto DNS setup — uses domain already saved in DB',
	})
	async getCfOAuthUrl(
		@Param('tenantId') tenantId: string,
		@Query() query: CfOAuthUrlQueryDto,
		@Req() req: Request,
	) {
		const requestOrigin = req.headers.origin ?? req.headers.referer;
		const url = await this.tenantDomainService.getCfOAuthUrl(tenantId, {
			returnUrl: query.returnUrl,
			requestOrigin,
		});
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
	@ApiOperation({
		summary:
			'Cloudflare OAuth callback — exchanges code and adds DNS records',
	})
	@Redirect()
	async cfOAuthCallback(@Query() query: CfOAuthCallbackDto) {
		// Peek returnUrl từ state để redirect về đúng trang admin bắt đầu flow.
		// handleCfOAuthCallback sẽ tự xóa state khi xử lý thành công.
		const returnUrl = this.tenantDomainService.resolveCallbackReturnUrl(
			query.state,
		);

		// Cloudflare trả error trực tiếp (vd: user từ chối authorize, scope sai)
		if (query.error || !query.code) {
			return {
				url: this.tenantDomainService.buildOAuthErrorRedirect(
					returnUrl,
					query.error ?? 'missing_code',
					query.error_description,
				),
			};
		}

		// Mọi lỗi trong quá trình xử lý đều redirect về FE thay vì trả 500,
		// để user biết chính xác config sai gì.
		try {
			const redirectUrl =
				await this.tenantDomainService.handleCfOAuthCallback(
					query.code,
					query.state,
				);
			return { url: redirectUrl };
		} catch (err) {
			const { code, description } =
				this.tenantDomainService.mapCfCallbackError(err);
			return {
				url: this.tenantDomainService.buildOAuthErrorRedirect(
					returnUrl,
					code,
					description,
				),
			};
		}
	}
}
