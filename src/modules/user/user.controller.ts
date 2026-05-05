import {
	Body,
	Controller,
	Delete,
	forwardRef,
	Get,
	Inject,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Query,
	Req,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { UserId } from 'src/common/decorators/req.decorators';
import {
	PageDto,
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';
import { DeleteResult } from 'typeorm';
import { AccessControlService } from '../access-control/access-control.service';
import { AuthMessages } from '../auth/constants/messages';
import {
	SystemAdminOnly,
	TenantOwnerOrAdminOnly,
} from '../auth/decorators/auth.decorator';
import { SYSTEM_TENANT_ID } from '../tenant/tenant.constant';
import { UpdateUserRoleDto } from '../user-role/user-role.dto';
import { UserMessages } from './constants/messages';
import {
	BulkUpdateTenantUserDto,
	CreateUserDto,
	GetListUserDto,
	InviteUserToTenantDto,
	UpdateUserDto,
} from './dto/user.dto';
import { User } from './entities/user.entity';
import { TenantUserType } from './enum/user.enum';
import { TenantUserService } from './services/tenant-user.service';
import { UserService } from './services/user.service';
import { checkIsSystemTenant } from './utils/user-type.util';

@TenantOwnerOrAdminOnly()
@ApiTags('Users')
@Controller('users')
export class UserController {
	constructor(
		private readonly userService: UserService,
		private readonly tenantUserService: TenantUserService,
		@Inject(forwardRef(() => AccessControlService))
		private readonly accessControlService: AccessControlService,
	) {}

	@Post()
	async create(
		@Body() payload: CreateUserDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<User>> {
		const tenantId = checkIsSystemTenant(req.user!.tenantId)
			? payload.tenantId
			: req.user!.tenantId;
		if (!tenantId) {
			throw new ResponseError(AuthMessages.TENANT_ID_REQUIRED);
		}

		const userReqId = req.user!.sub;

		const result = await this.userService.create(payload, userReqId);
		await this.tenantUserService.addUserToTenant(
			tenantId,
			result.id,
			payload.tenantUserType ?? TenantUserType.MEMBER,
			userReqId,
		);
		return new ResponseSuccess({ data: result });
	}

	@Post('invite')
	async inviteUserToTenant(
		@Body() payload: InviteUserToTenantDto,
		@Req() req: Request,
	) {
		const userReqId = req.user!.sub;

		const result = await this.tenantUserService.inviteUserToTenant(
			req.user!.tenantId,
			payload.email,
			payload.type ?? TenantUserType.MEMBER,
			userReqId,
		);
		return new ResponseSuccess({
			...UserMessages.INVITE.SUCCESS,
			data: result,
		});
	}

	@ApiOperation({
		summary: 'Get roles available for assignment in the current tenant',
	})
	@Get('assignable-roles')
	async getAssignableRoles(
		@Req() req: Request,
		@Query('tenantId') queryTenantId?: string,
	) {
		const targetTenantId =
			req.user!.tenantId === SYSTEM_TENANT_ID && queryTenantId
				? queryTenantId
				: req.user!.tenantId;

		const data =
			await this.accessControlService.getAssignableRoles(targetTenantId);
		return new ResponseSuccess({ data });
	}

	@ApiOperation({
		summary: 'Get roles assigned to a user in the current tenant',
	})
	@ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
	@Get(':userId/roles')
	async getUserRoles(
		@Param('userId', ParseUUIDPipe) userId: string,
		@Req() req: Request,
		@Query('tenantId') queryTenantId?: string,
	) {
		const targetTenantId =
			req.user!.tenantId === SYSTEM_TENANT_ID && queryTenantId
				? queryTenantId
				: req.user!.tenantId;

		const data = await this.accessControlService.getUserRoles(
			targetTenantId,
			userId,
		);
		return new ResponseSuccess({ data });
	}

	@ApiOperation({
		summary: 'Get resolved permissions of a user in the current tenant',
	})
	@ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
	@Get(':userId/permissions')
	async getUserPermissions(
		@Param('userId', ParseUUIDPipe) userId: string,
		@Req() req: Request,
		@Query('tenantId') queryTenantId?: string,
	) {
		const targetTenantId =
			req.user!.tenantId === SYSTEM_TENANT_ID && queryTenantId
				? queryTenantId
				: req.user!.tenantId;

		const data = await this.accessControlService.getUserPermissions(
			targetTenantId,
			userId,
		);
		return new ResponseSuccess({ data });
	}

	@ApiOperation({
		summary: 'Update roles assigned to a user in the current tenant',
	})
	@ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
	@Post(':userId/roles')
	async updateUserRoles(
		@Param('userId', ParseUUIDPipe) userId: string,
		@Body() payload: UpdateUserRoleDto,
		@Req() req: Request,
		@UserId() userReqId: string,
	) {
		const targetTenantId =
			req.user!.tenantId === SYSTEM_TENANT_ID && payload.tenantId
				? payload.tenantId
				: req.user!.tenantId;

		const data = await this.accessControlService.updateUserRoles(
			targetTenantId,
			userId,
			payload.roleIds,
			userReqId,
		);
		return new ResponseSuccess({ data });
	}

	@Get(':id')
	async findOne(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<User>> {
		const result = await this.userService.findOne(id, {
			relations: {
				tenantUser: {
					tenant: true,
				},
			},
			select: {
				tenantUser: {
					id: true,
					type: true,
					tenant: {
						id: true,
						name: true,
					},
				},
			},
		});
		return new ResponseSuccess({ data: result });
	}

	@Get()
	async getList(
		@Query() query: GetListUserDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<PageDto<User>>> {
		const result = await this.userService.getList(query, req);
		return new ResponseSuccess({ data: result });
	}

	// @ApiOperation({ summary: 'Sync user data from Auth0' })
	// @Post('sync-data')
	// async syncUserFromAuth0() {
	// 	await this.userSyncService.syncUserFromAuth0();
	// 	return new ResponseSuccess({
	// 		message: 'Sync user data from Auth0 successfully',
	// 	});
	// }

	@ApiOperation({
		summary:
			'Bulk update tenant user (accept tenant type member or admin only)',
	})
	@SystemAdminOnly()
	@Post('bulk-update-tenant-user')
	async bulkUpdateTenantUser(
		@Body() payload: BulkUpdateTenantUserDto,
		@Req() req: Request,
	) {
		const userReqId = req.user!.sub;
		const data = await this.tenantUserService.bulkUpdateTenantUser(
			payload,
			userReqId,
		);
		return new ResponseSuccess({ data });
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() payload: UpdateUserDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<User>> {
		const userReqId = req.user!.sub;
		const result = await this.userService.update(id, payload, userReqId);
		return new ResponseSuccess({ data: result });
	}

	@Delete(':id')
	async remove(
		@Param('id') id: string,
		@Req() req: Request,
	): Promise<ResponseSuccess<DeleteResult>> {
		const result = await this.tenantUserService.remove(req, id);
		return new ResponseSuccess({ data: result });
	}
}
