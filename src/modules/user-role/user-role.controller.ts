import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { AccessControlService } from '../access-control/access-control.service';
import { TenantOwnerOrAdminOnly } from '../auth/decorators/auth.decorator';
import { UpdateUserRoleDto } from './user-role.dto';

@TenantOwnerOrAdminOnly()
@ApiTags('User Roles')
@Controller('users')
export class UserRoleController {
	constructor(
		private readonly accessControlService: AccessControlService,
	) {}

	@ApiOperation({ summary: 'Get roles assigned to a user in the current tenant' })
	@ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
	@Get(':userId/roles')
	async getUserRoles(
		@Param('userId', ParseUUIDPipe) userId: string,
		@Req() req: Request,
	) {
		const data = await this.accessControlService.getUserRoles(
			req.user!.tenantId,
			userId,
		);
		return new ResponseSuccess({ data });
	}

	@ApiOperation({ summary: 'Get resolved permissions of a user in the current tenant' })
	@ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
	@Get(':userId/permissions')
	async getUserPermissions(
		@Param('userId', ParseUUIDPipe) userId: string,
		@Req() req: Request,
	) {
		const data = await this.accessControlService.getUserPermissions(
			req.user!.tenantId,
			userId,
		);
		return new ResponseSuccess({ data });
	}

	@ApiOperation({ summary: 'Update roles assigned to a user in the current tenant' })
	@ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
	@Post(':userId/roles')
	async updateUserRoles(
		@Param('userId', ParseUUIDPipe) userId: string,
		@Body() payload: UpdateUserRoleDto,
		@Req() req: Request,
	) {
		const data = await this.accessControlService.updateUserRoles(
			req.user!.tenantId,
			userId,
			payload.roleIds,
		);
		return new ResponseSuccess({ data });
	}

	@ApiOperation({ summary: 'Get roles available for assignment in the current tenant' })
	@Get('assignable-roles')
	async getAssignableRoles(@Req() req: Request) {
		const data = await this.accessControlService.getAssignableRoles(
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}
}
