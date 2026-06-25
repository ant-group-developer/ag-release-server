import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import difference from 'lodash/difference';
import {
	PageDto,
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';
import { CacheService } from 'src/modules/cache/cache.service';
import { EntityCache } from 'src/modules/cache/enum/cache.enum';
import { In, Repository } from 'typeorm';
import { RoleMessages } from '../constants/role.constant';
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
		private readonly cacheService: CacheService,
	) {}

	// create
	async handleCreateRole(data: CreateRoleDto, userId: string) {
		const { permissionIds, ...restOfData } = data;

		const role = await this.createRole({
			...restOfData,
			creatorId: userId,
			modifierId: userId,
		});

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

		// Invalidate all auth contexts — new role may be auto-enabled via isDefault
		await this.invalidateAllAuthContexts();

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
				page,
				pageSize,
				totalItems,
			},
		});
	}

	async getAll() {
		return this.roleRepo.find({
			select: ['id', 'name', 'code', 'note'],
		});
	}

	async getDefaultRoleIds(): Promise<string[]> {
		const roles = await this.roleRepo.find({
			where: { isDefault: true, isActive: true },
			select: ['id'],
		});
		return roles.map((r) => r.id);
	}

	// update
	async handleUpdate(id: string, data: UpdateRoleDto, userId: string) {
		const { permissionIds, ...rest } = data;

		const roleDb = await this.getOne(id);

		await this.updateRole(roleDb, rest, userId);

		// skip if error
		let messageWarnings: any[] = [];
		if (permissionIds) {
			messageWarnings = await this.updateRolePermissionSafe(
				roleDb,
				permissionIds,
			);
		}

		const result = await this.getOne(id);

		// Invalidate all auth contexts — role permissions may have changed
		await this.invalidateAllAuthContexts();

		return new ResponseSuccess({
			data: result,
			messageWarning: messageWarnings.join('\n'),
		});
	}

	private async updateRole(
		roleDb: Role,
		data: Omit<UpdateRoleDto, 'permissionIds'>,
		userId: string,
	) {
		const { name } = data;

		if (name && name !== roleDb.name) {
			await this.roleQueryService.validate({ name });
		}

		await this.roleRepo.update(roleDb.id, { ...data, modifierId: userId });
	}

	private async updateRolePermissionSafe(
		roleDb: Role,
		permissionIds: string[],
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

		// Invalidate all auth contexts — role removed
		await this.invalidateAllAuthContexts();
	}

	async deleteRole(id: string) {
		await this.roleRepo.delete(id);
	}

	async deleteRolePermissionOfRole({ roleId }: { roleId: string }) {
		await this.rolePermissionRepo.delete({ roleId });
	}

	async deleteRolePermission(rolePermissionId: string): Promise<void> {
		await this.rolePermissionRepo.delete(rolePermissionId);

		// Invalidate all auth contexts — permission removed from role
		await this.invalidateAllAuthContexts();
	}

	async validateExisted(roleIds: string[]) {
		const listRole = await this.roleRepo.find({
			where: {
				id: In(roleIds),
			},
			select: ['id'],
		});
		const data = listRole.map((item) => item.id);

		if (data.length !== roleIds.length) {
			const between = difference(roleIds, data);
			throw new ResponseError({
				...RoleMessages.NOT_FOUND,
				data: between,
			});
		}
	}

	/**
	 * Invalidate all auth_context cache entries.
	 * Role changes are global — affects all users across all tenants.
	 */
	private async invalidateAllAuthContexts(): Promise<void> {
		await this.cacheService.delByPrefix({
			entity: EntityCache.AUTH_CONTEXT,
			prefix: '*',
		});
	}
}
