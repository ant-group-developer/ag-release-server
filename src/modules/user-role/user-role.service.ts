import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../permission/entities/permission.entity';
import { PermissionService } from '../permission/services/permission.service';
import { Role } from '../role/entities/role.entity';
import { RoleService } from '../role/services/role.service';
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
	) {}

	async update(tenantId: string, { userId, roleIds }: UpdateUserRoleDto) {
		if (
			await this.userTypeService.checkCanAccessTenantAll(tenantId, userId)
		) {
			return [];
		}
		await this.roleService.validateExisted(roleIds);
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
		if (
			await this.userTypeService.checkCanAccessTenantAll(tenantId, userId)
		) {
			return this.roleService.getAll();
		}

		return this.userRoleRepository
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
			.andWhere('userRole.userId = :userId', { userId })
			.getRawMany();
	}

	async getPermission(
		tenantId: string,
		userId: string,
	): Promise<Permission[]> {
		if (
			await this.userTypeService.checkCanAccessTenantAll(tenantId, userId)
		) {
			return this.permissionService.getAll();
		}

		return this.userRoleRepository
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
			.getRawMany();
	}
}
