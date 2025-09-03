import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Query,
	Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	SystemAdminOnly,
	TenantOwnerOrAdminOnly,
} from '../auth/decorators/auth.decorator';
import {
	RoleMessageCodeSuccess,
	RoleMessageSuccess,
} from './constants/role.constant';
import {
	BulkDeleteRoleDto,
	CreateRoleDto,
	GetListRole,
	UpdateRoleDto,
} from './dtos/role.dto';
import { RoleService } from './services/role.service';

@Controller('roles')
export class RoleController {
	constructor(private readonly roleService: RoleService) {}

	@SystemAdminOnly()
	@Post()
	async handleCreateRole(@Body() data: CreateRoleDto, @Req() req: Request) {
		const userId = req.user!.sub;
		const result = await this.roleService.handleCreateRole(data, userId);
		return new ResponseSuccess({
			...result,
			message: RoleMessageSuccess.CREATE,
			messageCode: RoleMessageCodeSuccess.CREATE,
		});
	}

	@TenantOwnerOrAdminOnly()
	@Get(':id')
	async getOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.roleService.getOne(id);
		return new ResponseSuccess({
			message: 'Get detail successfully',
			data: result,
		});
	}

	@TenantOwnerOrAdminOnly()
	@Get()
	async getList(@Query() data: GetListRole) {
		const result = await this.roleService.getList(data);

		return new ResponseSuccess({
			message: 'Get list successfully',
			data: result,
		});
	}

	@SystemAdminOnly()
	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateRoleDto,
		@Req() req: Request,
	) {
		const userId = req.user!.sub;
		const result = await this.roleService.handleUpdate(id, data, userId);

		return new ResponseSuccess({
			...result,
			message: RoleMessageSuccess.UPDATE,
			messageCode: RoleMessageCodeSuccess.UPDATE,
		});
	}

	@SystemAdminOnly()
	@Post('bulk-delete')
	async bulkDelete(@Body() data: BulkDeleteRoleDto) {
		const result = await this.roleService.bulkDelete(data);
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Delete(':id')
	async delete(@Param('id', ParseUUIDPipe) id: string) {
		await this.roleService.handleDelete(id);
		return new ResponseSuccess();
	}

	@SystemAdminOnly()
	@Delete(':id/role-permissions/:rolePermissionId')
	async deleteRolePermission(
		@Param('rolePermissionId', ParseUUIDPipe) rolePermissionId: string,
	) {
		await this.roleService.deleteRolePermission(rolePermissionId);
		return new ResponseSuccess({
			message: 'delete role permission successfully',
		});
	}
}
