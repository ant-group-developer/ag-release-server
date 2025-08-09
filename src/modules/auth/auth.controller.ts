import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import { RefreshDto, SiginDto } from './auth.dto';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
	constructor(private readonly auth: AuthService) {}

	@Get('me')
	async me(@Req() req: Request) {
		const data = await this.auth.me(req);
		return new ResponseSuccess({ data });
	}

	@Public()
	@Post('login')
	async login(@Body() body: SiginDto) {
		const data = await this.auth.login(body);
		return new ResponseSuccess({ data });
	}

	@Public()
	@Post('refresh')
	async refresh(@Body() body: RefreshDto) {
		return this.auth.refresh(body.refreshToken);
	}

	@Public()
	@Post('logout')
	async logout(@Body() body: RefreshDto) {
		return this.auth.logout(body.refreshToken);
	}
}
