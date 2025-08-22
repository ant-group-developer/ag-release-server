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
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import { DeleteResult } from 'typeorm';
import { UserMessages } from './constants/messages';
import {
	CreateUserDto,
	GetListUserDto,
	InviteUserToTenantDto,
	UpdateUserDto,
} from './dto/user.dto';
import { User } from './entities/user.entity';
import { TenantUserType, UserType } from './enum/user.enum';
import { TenantUserService } from './services/tenant-user.service';
import { UserService } from './services/user.service';

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
		const result = await this.userService.create(payload);
		const tenantId =
			req.user?.type === UserType.ADMIN
				? (payload.tenantId ?? req.user?.tenantId)
				: req.user!.tenantId;
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
		const result = await this.userService.findOne(id);
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
