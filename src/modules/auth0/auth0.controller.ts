import { Controller, Get } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import { Auth0UserService } from './services/auth0-user.service';
import { Auth0Service } from './services/auth0.service';

@Controller('auth0')
export class Auth0Controller {
	constructor(
		private readonly auth0Service: Auth0Service,
		private readonly auth0UserService: Auth0UserService,
	) {}

	@Get('token')
	@ApiOperation({ summary: 'Get auth0 token' })
	async getToken() {
		const result = await this.auth0Service.getToken();
		return new ResponseSuccess({ data: result });
	}

	@Get('users')
	@ApiOperation({ summary: 'Get auth0 users' })
	async getAllUsers() {
		const result = await this.auth0UserService.getAllUsers();
		return new ResponseSuccess({
			data: new PageDto({
				items: result,
				metadata: {
					currentPage: 1,
					pageSize: result.length,
					totalItems: result.length,
					totalPages: 1,
				},
			}),
		});
	}
}
