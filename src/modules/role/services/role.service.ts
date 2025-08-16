import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
	PageDto,
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/response.dto';
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
	private readonly logger = new Logger(RoleService.name);

	constructor(
		@InjectRepository(Role)
		private readonly roleRepo: Repository<Role>,

		@InjectRepository(RolePermission)
		private readonly rolePermissionRepo: Repository<RolePermission>,

		private readonly roleQueryService: RoleQueryService,
	) {}

	// create
	async handleCreateRole(data: CreateRoleDto) {
		const { permissionIds, ...restOfData } = data;

		const role = await this.createRole(restOfData);

		// skip if error
		const messageWarnings = await Promise.all(
			permissionIds.map((permissionId) =>
				this.createRolePermissionSafe({
					permissionId,
					roleId: role.id,
				}),
			),
		);

		const result = await this.getOne(role.id);

		return new ResponseSuccess({
			data: result,
			messageWarning: messageWarnings.join('\n'),
		});
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

	private async createRolePermissionSafe(data: ICreateRolePermission) {
		try {
			await this.createRolePermission(data);
		} catch (error) {
			const message = error?.response?.messageWarning ?? 'Unknown error';

			this.logger.error(message);
			return message;
		}
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
		const { permissionIds, ...rest } = data;

		const roleDb = await this.getOne(id);

		await this.updateRole(roleDb, rest);

		// skip if error
		const messageWarnings = await this.updateRolePermissionSafe(
			roleDb,
			permissionIds,
		);

		const result = await this.getOne(id);

		return new ResponseSuccess({
			data: result,
			messageWarning: messageWarnings.join('\n'),
		});
	}

	private async updateRole(
		roleDb: Role,
		data: Omit<UpdateRoleDto, 'permissionIds'>,
	) {
		const { name } = data;

		if (roleDb && roleDb.name !== name) {
			await this.roleQueryService.validate({ name });
		}

		await this.roleRepo.update(roleDb.id, data);
	}

	private async updateRolePermissionSafe(
		roleDb: Role,
		permissionIds: UpdateRoleDto['permissionIds'],
	) {
		await this.deleteRolePermissionOfRole({ roleId: roleDb.id });

		const messageWarnings = await Promise.all(
			permissionIds.map((permissionId) =>
				this.createRolePermissionSafe({
					permissionId,
					roleId: roleDb.id,
				}),
			),
		);

		return messageWarnings;
	}

	// delete
	async bulkDelete(data: BulkDeleteRoleDto) {
		const { ids } = data;
		await Promise.all(ids.map((id) => this.handleDelete(id)));
	}

	async handleDelete(id: string): Promise<void> {
		await this.deleteRolePermissionOfRole({ roleId: id });
		await this.deleteRole(id);
	}

	async deleteRole(id: string) {
		await this.roleRepo.delete(id);
	}

	async deleteRolePermissionOfRole({ roleId }: { roleId: string }) {
		await this.rolePermissionRepo.delete({ roleId });
	}

	async deleteRolePermission(rolePermissionId: string): Promise<void> {
		await this.rolePermissionRepo.delete(rolePermissionId);
	}
}
