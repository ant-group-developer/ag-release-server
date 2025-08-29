import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import { RefreshDto, SiginDto, SwitchTenantDto } from './auth.dto';
import { AuthService } from './auth.service';
import { PublicRoute } from './decorators/auth.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
	constructor(private readonly auth: AuthService) {}

	@Get('me')
	me(@Req() req: Request) {
		const data = this.auth.me(req);
		return new ResponseSuccess({ data });
	}

	@Get('tenant')
	async tenant(@Req() req: Request) {
		const data = await this.auth.tenant(req);
		return new ResponseSuccess({ data });
	}

	@PublicRoute()
	@Post('login')
	async login(@Body() body: SiginDto) {
		const data = await this.auth.login(body);
		return new ResponseSuccess({ data });
	}

	@Post('switch-tenant')
	async switchTenant(@Body() body: SwitchTenantDto, @Req() req: Request) {
		const data = await this.auth.switchTenant(body.tenantId, req.user!.sub);
		return new ResponseSuccess({ data });
	}

	@PublicRoute()
	@Post('refresh')
	async refresh(@Body() body: RefreshDto) {
		const data = await this.auth.refresh(body.refreshToken);
		return new ResponseSuccess({ data });
	}

	@PublicRoute()
	@Post('logout')
	async logout(@Body() body: RefreshDto) {
		return this.auth.logout(body.refreshToken);
	}
}
