import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import { UpdateUserRoleDto } from './user-role.dto';
import { UserRoleService } from './user-role.service';

@ApiTags('User Role')
@Controller('user-role')
export class UserRoleController {
	constructor(private readonly userRoleService: UserRoleService) {}

	@ApiOperation({ summary: 'Get list roles of user in tenant' })
	@ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
	@Get(':userId/role')
	async getUserRole(@Param('userId') userId: string, @Req() req: Request) {
		const data = await this.userRoleService.getRole(
			req.user!.tenantId,
			userId,
		);
		return new ResponseSuccess({ data });
	}

	@ApiOperation({ summary: 'Get list permissions of user in tenant' })
	@ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
	@Get(':userId/permission')
	async getUserpermission(
		@Param('userId') userId: string,
		@Req() req: Request,
	) {
		const data = await this.userRoleService.getPermission(
			req.user!.tenantId,
			userId,
		);
		return new ResponseSuccess({ data });
	}

	@ApiOperation({ summary: 'Update user roles in tenant' })
	@Post()
	async updateUserRole(
		@Body() payload: UpdateUserRoleDto,
		@Req() req: Request,
	) {
		const data = await this.userRoleService.update(
			req.user!.tenantId,
			payload,
		);
		return new ResponseSuccess({ data });
	}
}
