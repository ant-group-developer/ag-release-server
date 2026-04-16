import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../permission/entities/permission.entity';
import { PermissionService } from '../permission/services/permission.service';
import { Role } from '../role/entities/role.entity';
import { RoleService } from '../role/services/role.service';
import { TenantRolesService } from '../tenant-roles/tenant-roles.service';
import { UserTypeService } from '../user/services/user-type.service';
import { UpdateUserRoleDto } from './user-role.dto';
import { UserRole } from './user-role.entity';

@Injectable()
export class UserRoleService {
	constructor(
		@InjectRepository(UserRole)
		private readonly userRoleRepository: Repository<UserRole>,
		private readonly userTypeService: UserTypeService,
		private readonly roleService: RoleService,
		private readonly permissionService: PermissionService,
		private readonly tenantRolesService: TenantRolesService,
	) {}

	async update(tenantId: string, { userId, roleIds }: UpdateUserRoleDto) {
		if (
			await this.userTypeService.checkCanAccessTenantAll(tenantId, userId)
		) {
			return [];
		}

		await this.roleService.validateExisted(roleIds);

		// Validate that all assigned roles are enabled for the tenant
		const enabledRoleIds =
			await this.tenantRolesService.getEnabledRoleIds(tenantId);
		if (enabledRoleIds !== null) {
			const disabledRoles = roleIds.filter(
				(id) => !enabledRoleIds.includes(id),
			);
			if (disabledRoles.length > 0) {
				await this.roleService.validateExisted([]); // will not throw, but we throw manually
				throw new Error(
					`Roles [${disabledRoles.join(', ')}] are not enabled for this tenant`,
				);
			}
		}

		await this.userRoleRepository.delete({ tenantId, userId });
		const newData = this.userRoleRepository.create(
			roleIds.map((roleId) => ({
				tenantId,
				userId,
				roleId,
			})),
		);
		return this.userRoleRepository.save(newData);
	}

	async getRole(tenantId: string, userId: string): Promise<Role[]> {
		const enabledRoleIds =
			await this.tenantRolesService.getEnabledRoleIds(tenantId);

		if (
			await this.userTypeService.checkCanAccessTenantAll(tenantId, userId)
		) {
			const allRoles = await this.roleService.getAll();
			if (enabledRoleIds === null) return allRoles;
			if (enabledRoleIds.length === 0) return [];
			return allRoles.filter((role) => enabledRoleIds.includes(role.id));
		}

		const query = this.userRoleRepository
			.createQueryBuilder('userRole')
			.leftJoin('userRole.role', 'role')
			.select([
				'role.id AS id',
				'role.name AS name',
				'role.code AS code',
				'role.note AS note',
			])
			.distinct()
			.where('userRole.tenantId = :tenantId', { tenantId })
			.andWhere('userRole.userId = :userId', { userId });

		// Filter by tenant-enabled roles
		if (enabledRoleIds !== null) {
			if (enabledRoleIds.length === 0) return [];
			query.andWhere('role.id IN (:...enabledRoleIds)', {
				enabledRoleIds,
			});
		}

		return query.getRawMany();
	}

	async getPermission(
		tenantId: string,
		userId: string,
	): Promise<Permission[]> {
		const enabledRoleIds =
			await this.tenantRolesService.getEnabledRoleIds(tenantId);

		if (
			await this.userTypeService.checkCanAccessTenantAll(tenantId, userId)
		) {
			if (enabledRoleIds === null) {
				return this.permissionService.getAll();
			}
			if (enabledRoleIds.length === 0) {
				return [];
			}

			const query = this.userRoleRepository.manager
				.createQueryBuilder(Role, 'role')
				.leftJoin('role.rolePermissions', 'rolePermissions')
				.leftJoin('rolePermissions.permission', 'permission')
				.select([
					'permission.id AS id',
					'permission.name AS name',
					'permission.code AS code',
					'permission.note AS note',
				])
				.distinct()
				.where('role.id IN (:...enabledRoleIds)', { enabledRoleIds })
				.andWhere('permission.id IS NOT NULL'); // Ensure we don't return null if a role has no permissions

			return query.getRawMany();
		}

		const query = this.userRoleRepository
			.createQueryBuilder('userRole')
			.leftJoin('userRole.role', 'role')
			.leftJoin('role.rolePermissions', 'rolePermissions')
			.leftJoin('rolePermissions.permission', 'permission')
			.select([
				'permission.id AS id',
				'permission.name AS name',
				'permission.code AS code',
				'permission.note AS note',
			])
			.distinct()
			.where('userRole.tenantId = :tenantId', { tenantId })
			.andWhere('userRole.userId = :userId', { userId })
			.andWhere('permission.id IS NOT NULL');

		// Filter by tenant-enabled roles
		if (enabledRoleIds !== null) {
			if (enabledRoleIds.length === 0) return [];
			query.andWhere('role.id IN (:...enabledRoleIds)', {
				enabledRoleIds,
			});
		}

		return query.getRawMany();
	}
}
