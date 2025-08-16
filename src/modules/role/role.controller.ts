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
} from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
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

	// create
	@Post()
	async handleCreateRole(@Body() data: CreateRoleDto) {
		const result = await this.roleService.handleCreateRole(data);
		return new ResponseSuccess({
			...result,
			message: RoleMessageSuccess.CREATE,
			messageCode: RoleMessageCodeSuccess.CREATE,
		});
	}

	// read
	@Get(':id')
	async getOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.roleService.getOne(id);
		return new ResponseSuccess({
			message: 'Get detail successfully',
			data: result,
		});
	}

	@Get()
	async getList(@Query() data: GetListRole) {
		const result = await this.roleService.getList(data);

		return new ResponseSuccess({
			message: 'Get list successfully',
			data: result,
		});
	}

	// update
	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateRoleDto,
	) {
		const result = await this.roleService.handleUpdate(id, data);

		return new ResponseSuccess({
			...result,
			message: RoleMessageSuccess.UPDATE,
			messageCode: RoleMessageCodeSuccess.UPDATE,
		});
	}

	// delete
	@Post('bulk-delete')
	async bulkDelete(@Body() data: BulkDeleteRoleDto) {
		const result = await this.roleService.bulkDelete(data);
		return new ResponseSuccess({ data: result });
	}

	@Delete(':id')
	async delete(@Param('id', ParseUUIDPipe) id: string) {
		await this.roleService.handleDelete(id);
		return new ResponseSuccess();
	}

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
