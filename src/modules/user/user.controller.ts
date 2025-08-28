import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Put,
	Query,
	Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import {
	PageDto,
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/response.dto';
import { DeleteResult } from 'typeorm';
import { AuthMessages } from '../auth/constants/messages';
import {
	SystemAdminOnly,
	TenantOwnerOrAdminOnly,
} from '../auth/decorators/auth.decorator';
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

		const result = await this.userService.create(payload);
		await this.tenantUserService.addUserToTenant(
			tenantId,
			result.id,
			payload.tenantType ?? TenantUserType.MEMBER,
		);
		return new ResponseSuccess({ data: result });
	}

	@Post('invite')
	async inviteUserToTenant(
		@Body() payload: InviteUserToTenantDto,
		@Req() req: Request,
	) {
		const result = await this.tenantUserService.inviteUserToTenant(
			req.user!.tenantId,
			payload.email,
			payload.type ?? TenantUserType.MEMBER,
		);
		return new ResponseSuccess({
			...UserMessages.INVITE.SUCCESS,
			data: result,
		});
	}

	@Get(':id')
	async findOne(@Param('id') id: string): Promise<ResponseSuccess<User>> {
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
	async bulkUpdateTenantUser(@Body() payload: BulkUpdateTenantUserDto) {
		const data = await this.tenantUserService.bulkUpdateTenantUser(payload);
		return new ResponseSuccess({ data });
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() payload: UpdateUserDto,
	): Promise<ResponseSuccess<User>> {
		const result = await this.userService.update(id, payload);
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
