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
import { PageDto, ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { DeleteResult } from 'typeorm';
import { AccessControlService } from '../access-control/access-control.service';
import {
	RequirePermissions,
	SystemAdminOnly,
} from '../auth/decorators/auth.decorator';
import { Permission } from '../permission/constants/permission.data.constant';
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
import {
	checkIsSystemAdmin,
	checkIsSystemTenant,
} from './utils/user-type.util';

@ApiTags('Users')
@Controller('users')
export class UserController {
	constructor(
		private readonly userService: UserService,
		private readonly tenantUserService: TenantUserService,
		@Inject(forwardRef(() => AccessControlService))
		private readonly accessControlService: AccessControlService,
	) {}

	@RequirePermissions(Permission.USER.CREATE)
	@Post()
	async create(
		@Body() payload: CreateUserDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<User>> {
		const tenantId = checkIsSystemTenant(req.user!.tenantId)
			? payload.tenantId
			: req.user!.tenantId;

		const userReqId = req.user!.sub;

		const result = await this.userService.create(payload, userReqId);

		if (tenantId) {
			await this.tenantUserService.addUserToTenant(
				tenantId,
				result.id,
				payload.tenantUserType ?? TenantUserType.MEMBER,
				userReqId,
			);
		}

		return new ResponseSuccess({ data: result });
	}

	@RequirePermissions(Permission.USER.INVITE)
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

	@RequirePermissions(Permission.USER.UPDATE_ROLE)
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

	@RequirePermissions(Permission.USER.READ)
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

	@RequirePermissions(Permission.USER.READ)
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

	@RequirePermissions(Permission.USER.UPDATE_ROLE)
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

	@RequirePermissions(Permission.USER.READ)
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

	@RequirePermissions(Permission.USER.READ)
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

	@RequirePermissions(
		Permission.USER.UPDATE_INFO,
		Permission.USER.UPDATE_STATUS,
		Permission.USER.UPDATE_TENANT_TYPE,
	)
	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() payload: UpdateUserDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<User>> {
		const userReqId = req.user!.sub;
		const tenantId = req.user!.tenantId;
		const isSysAdmin = checkIsSystemAdmin(req.user!.type);

		// Field-level permission: strip fields user cannot change (system admins bypass)
		if (!isSysAdmin) {
			const userPerms = new Set<string>(
				Array.isArray(req.user!.permission) ? req.user!.permission : [],
			);

			if (!userPerms.has(Permission.USER.UPDATE_STATUS)) {
				delete payload.isActive;
			}

			if (!userPerms.has(Permission.USER.UPDATE_TENANT_TYPE)) {
				delete payload.tenantUserType;
			}

			if (!userPerms.has(Permission.USER.UPDATE_INFO)) {
				delete payload.name;
				delete payload.email;
				delete payload.avatar;
				delete payload.password;
				delete payload.telegramId;
				delete payload.emailVerified;
			}
		}

		const result = await this.userService.update(id, payload, userReqId);

		if (payload.tenantUserType) {
			await this.tenantUserService.updateUserTenantType(
				tenantId,
				id,
				payload.tenantUserType,
			);
		}

		return new ResponseSuccess({ data: result });
	}

	@RequirePermissions(Permission.USER.DELETE)
	@Delete(':id')
	async remove(
		@Param('id') id: string,
		@Req() req: Request,
	): Promise<ResponseSuccess<DeleteResult>> {
		const result = await this.tenantUserService.remove(req, id);
		return new ResponseSuccess({ data: result });
	}
}
