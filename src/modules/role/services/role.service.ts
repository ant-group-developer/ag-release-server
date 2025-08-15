import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	BulkDeleteRoleDto,
	CreateRoleDto,
	GetListRole,
	UpdateRoleDto,
} from '../dtos/role.dto';
import { RolePermission } from '../entities/role-permission.entity';
import { Role } from '../entities/role.entity';
import {
	ICreateRole,
	ICreateRolePermission,
} from '../interfaces/role.interface';
import { RoleQueryService } from './role.query.service';

@Injectable()
export class RoleService {
	constructor(
		@InjectRepository(Role)
		private readonly roleRepo: Repository<Role>,

		@InjectRepository(RolePermission)
		private readonly rolePermissionRepo: Repository<RolePermission>,

		private readonly roleQueryService: RoleQueryService,
	) {}

	// create
	async handleCreateRole(data: CreateRoleDto) {
		const { rolePermissions, ...restOfData } = data;

		const role = await this.createRole(restOfData);

		const rolePermissionsResult = await Promise.all(
			rolePermissions.map((item) =>
				this.createRolePermission({
					permissionId: item.permissionId,
					roleId: role.id,
				}),
			),
		);

		return { ...role, rolePermissions: rolePermissionsResult };
	}

	private async createRole(data: ICreateRole) {
		const { name } = data;
		await this.roleQueryService.validate({ name });

		const role = this.roleRepo.create(data);
		return await this.roleRepo.save(role);
	}

	private async createRolePermission(data: ICreateRolePermission) {
		const { permissionId } = data;
		await this.roleQueryService.validate({ permissionId });

		return await this.rolePermissionRepo.save(data);
	}

	// read
	async getOne(id: string) {
		const role = await this.roleQueryService.getOne(id);

		if (!role) {
			throw new ResponseError({ message: 'Role not found' });
		}

		return role;
	}

	async getList(data: GetListRole) {
		const { page, pageSize } = data;

		const [roles, totalItems] = await this.roleQueryService.getList(data);

		return new PageDto({
			items: roles,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	// update
	async handleUpdate(id: string, data: UpdateRoleDto) {
		const { rolePermissions, ...rest } = data;

		const roleDb = await this.getOne(id);

		await this.updateRole(roleDb, rest);

		// update role permission
		await this.deleteRolePermissionOfRole({ roleId: roleDb.id });

		await Promise.all(
			rolePermissions.map((item) =>
				this.createRolePermission({
					permissionId: item.permissionId,
					roleId: roleDb.id,
				}),
			),
		);
	}

	private async updateRole(
		roleDb: Role,
		data: Omit<UpdateRoleDto, 'rolePermissions'>,
	) {
		const { name } = data;

		if (roleDb && roleDb.name !== name) {
			await this.roleQueryService.validate({ name });
		}

		await this.roleRepo.update(roleDb.id, data);
	}

	// delete
	async bulkDelete(data: BulkDeleteRoleDto) {
		const { ids } = data;

		const errorMessages: string[] = [];

		await Promise.all(
			ids.map((id) =>
				this.delete(id).catch((e) => {
					errorMessages.push(`"${id}" skipped. Reason: ${e.message}`);
				}),
			),
		);

		return {
			message: errorMessages.join('\n'),
		};
	}

	async delete(id: string): Promise<void> {
		await this.rolePermissionRepo.delete({ roleId: id });
		await this.roleRepo.delete(id);
	}

	async deleteRolePermissionOfRole({
		roleId,
	}: {
		roleId: string;
	}): Promise<void> {
		await this.rolePermissionRepo.delete({ roleId });
	}

	async deleteRolePermission(rolePermissionId: string): Promise<void> {
		await this.rolePermissionRepo.delete(rolePermissionId);
	}
}
