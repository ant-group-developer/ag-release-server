import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { EntityCache } from '../cache/enum/cache.enum';
import { Permission } from '../permission/entities/permission.entity';
import { PermissionService } from '../permission/services/permission.service';
import { Role } from '../role/entities/role.entity';
import { RoleService } from '../role/services/role.service';
import { TenantRolesService } from '../tenant-roles/tenant-roles.service';
import { SYSTEM_TENANT_ID } from '../tenant/tenant.constant';
import { TenantType } from '../tenant/tenant.enum';
import { TenantService } from '../tenant/tenant.service';
import { UserRole } from '../user-role/user-role.entity';
import { TenantUserType, UserType } from '../user/enum/user.enum';
import { TenantUserService } from '../user/services/tenant-user.service';
import { UserService } from '../user/services/user.service';
import { AuthContext } from './access-control.interface';

const AUTH_CACHE_TTL = 86_400_000; // 24 hours in ms

@Injectable()
export class AccessControlService {
	constructor(
		private readonly userService: UserService,
		private readonly tenantService: TenantService,
		private readonly tenantUserService: TenantUserService,
		private readonly tenantRolesService: TenantRolesService,
		private readonly permissionService: PermissionService,
		private readonly roleService: RoleService,
		private readonly cacheService: CacheService,
		@InjectRepository(UserRole)
		private readonly userRoleRepository: Repository<UserRole>,
	) {}

	// ─── Auth Context (Redis-cached) ─────────────────────────────

	/**
	 * Single entry point for resolving the full authentication context.
	 * Checks Redis first; on miss, builds from DB and caches the result.
	 */
	async getAuthContext(
		userId: string,
		tenantId: string,
	): Promise<AuthContext> {
		const cacheKey = `${userId}_${tenantId}`;

		const cached = await this.cacheService.get<AuthContext>({
			entity: EntityCache.AUTH_CONTEXT,
			key: cacheKey,
		});
		if (cached) return cached;

		const context = await this.buildAuthContext(userId, tenantId);

		await this.cacheService.set({
			entity: EntityCache.AUTH_CONTEXT,
			key: cacheKey,
			value: context,
			ttl: AUTH_CACHE_TTL,
		});

		return context;
	}

	/**
	 * Invalidate cached auth context when user roles/permissions/status change.
	 */
	async invalidateAuthContext(
		userId: string,
		tenantId?: string,
	): Promise<void> {
		if (tenantId) {
			await this.cacheService.del({
				entity: EntityCache.AUTH_CONTEXT,
				key: `${userId}_${tenantId}`,
			});
		}
	}

	// ─── Assignable Roles (for UI grant permission) ──────────────

	/**
	 * Returns the list of roles that can be assigned to a user in this tenant.
	 * Only returns roles that are both globally active AND enabled for the tenant.
	 * This is the backend-driven replacement for client-side filtering.
	 */
	async getAssignableRoles(tenantId: string): Promise<Role[]> {
		if (tenantId === SYSTEM_TENANT_ID) return [];

		const enabledRoleIds =
			await this.tenantRolesService.getEnabledRoleIds(tenantId);

		const query = this.userRoleRepository.manager
			.createQueryBuilder(Role, 'role')
			.select([
				'role.id',
				'role.name',
				'role.code',
				'role.color',
				'role.note',
			])
			.leftJoinAndSelect('role.rolePermissions', 'rolePermissions')
			.leftJoinAndSelect('rolePermissions.permission', 'permission')
			.where('role.isActive = :isActive', { isActive: true });

		if (enabledRoleIds !== null) {
			if (enabledRoleIds.length === 0) return [];
			query.andWhere('role.id IN (:...enabledRoleIds)', {
				enabledRoleIds,
			});
		}

		return query.orderBy('role.name', 'ASC').getMany();
	}

	// ─── User Roles (assigned roles for a specific user) ─────────

	/**
	 * Get the roles currently assigned to a user in a tenant.
	 * Only returns active roles that are also enabled for the tenant.
	 */
	async getUserRoles(tenantId: string, userId: string): Promise<Role[]> {
		if (tenantId === SYSTEM_TENANT_ID) return [];

		const enabledRoleIds =
			await this.tenantRolesService.getEnabledRoleIds(tenantId);

		// Full-access users get all assignable roles
		const hasFullAccess = await this.checkHasFullAccess(tenantId, userId);
		if (hasFullAccess) {
			return this.getAssignableRoles(tenantId);
		}

		const query = this.userRoleRepository
			.createQueryBuilder('userRole')
			.leftJoinAndSelect('userRole.role', 'role')
			.leftJoinAndSelect('role.rolePermissions', 'rolePermissions')
			.leftJoinAndSelect('rolePermissions.permission', 'permission')
			.where('userRole.tenantId = :tenantId', { tenantId })
			.andWhere('userRole.userId = :userId', { userId })
			.andWhere('role.isActive = :isActive', { isActive: true });

		if (enabledRoleIds !== null) {
			if (enabledRoleIds.length === 0) return [];
			query.andWhere('role.id IN (:...enabledRoleIds)', {
				enabledRoleIds,
			});
		}

		const userRoles = await query.getMany();
		return userRoles.map((ur) => ur.role);
	}

	// ─── Update User Roles ───────────────────────────────────────

	/**
	 * Update roles assigned to a user in a tenant.
	 * Validates that roles are active and enabled for the tenant.
	 * Invalidates the user's auth cache after mutation.
	 */
	async updateUserRoles(
		tenantId: string,
		userId: string,
		roleIds: string[],
		userReqId: string,
	) {
		if (tenantId === SYSTEM_TENANT_ID) return [];

		// Full-access users cannot have their roles manually overridden
		const hasFullAccess = await this.checkHasFullAccess(tenantId, userId);
		if (hasFullAccess) return [];

		// Validate roles exist
		await this.roleService.validateExisted(roleIds);

		// Validate all roles are enabled for the tenant
		const enabledRoleIds =
			await this.tenantRolesService.getEnabledRoleIds(tenantId);
		if (enabledRoleIds !== null && roleIds.length > 0) {
			const disabledRoles = roleIds.filter(
				(id) => !enabledRoleIds.includes(id),
			);
			if (disabledRoles.length > 0) {
				throw new Error(
					`Roles [${disabledRoles.join(', ')}] are not enabled for this tenant`,
				);
			}
		}

		// Replace all user roles in this tenant
		await this.userRoleRepository.delete({ tenantId, userId });
		const newData = this.userRoleRepository.create(
			roleIds.map((roleId) => ({
				tenantId,
				userId,
				roleId,
				creatorId: userReqId,
				modifierId: userReqId,
			})),
		);
		const result = await this.userRoleRepository.save(newData);

		// Invalidate Redis cache so permissions refresh on next request
		await this.invalidateAuthContext(userId, tenantId);

		return result;
	}

	// ─── User Permissions (resolved) ─────────────────────────────

	/**
	 * Get the resolved permissions for a user in a tenant.
	 * Only includes permissions from active roles enabled for the tenant.
	 */
	async getUserPermissions(
		tenantId: string,
		userId: string,
	): Promise<Permission[]> {
		if (tenantId === SYSTEM_TENANT_ID) return [];

		const enabledRoleIds =
			await this.tenantRolesService.getEnabledRoleIds(tenantId);

		const hasFullAccess = await this.checkHasFullAccess(tenantId, userId);
		if (hasFullAccess) {
			return this.resolveFullAccessPermissionEntities(enabledRoleIds);
		}

		return this.resolveUserPermissionEntities(
			userId,
			tenantId,
			enabledRoleIds,
		);
	}

	// ─── Private Helpers ─────────────────────────────────────────

	/**
	 * Check if user has full access (system admin or tenant owner/admin).
	 */
	private async checkHasFullAccess(
		tenantId: string,
		userId: string,
	): Promise<boolean> {
		const user = await this.userService.findOne(userId, {
			select: ['id', 'type'],
		});
		if (user.type === UserType.ADMIN) return true;

		if (tenantId === SYSTEM_TENANT_ID) return false;

		const membership = await this.tenantUserService.findOne(
			tenantId,
			userId,
		);
		return (
			!!membership &&
			[TenantUserType.OWNER, TenantUserType.ADMIN].includes(
				membership.type,
			)
		);
	}

	private async buildAuthContext(
		userId: string,
		tenantId: string,
	): Promise<AuthContext> {
		const isSystemTenant = tenantId === SYSTEM_TENANT_ID;

		const user = await this.userService.findOne(userId, {
			select: ['id', 'type', 'isActive', 'email', 'name', 'avatar'],
		});
		this.userService.checkActive(user.isActive);

		const isSystemAdmin = user.type === UserType.ADMIN;

		let tenantType: TenantType;
		let tenantUserType: TenantUserType;

		if (isSystemTenant) {
			tenantType = TenantType.WHITE_LABEL;
			tenantUserType = TenantUserType.OWNER;
		} else {
			const tenant = await this.tenantService.getOneTenantData(tenantId, {
				select: ['isActive', 'type'],
			});
			this.tenantService.checkActive(tenant.isActive);
			tenantType = tenant.type;

			if (isSystemAdmin) {
				tenantUserType = TenantUserType.OWNER;
			} else {
				const membership = await this.tenantUserService.checkMembership(
					tenantId,
					userId,
				);
				tenantUserType = membership.type;
			}
		}

		const permissions = await this.resolvePermissionCodes(
			userId,
			tenantId,
			user.type,
			tenantUserType,
			isSystemTenant,
		);

		return {
			userId: user.id,
			tenantId,
			email: user.email,
			name: user.name,
			avatar: user.avatar,
			userType: user.type,
			tenantType,
			tenantUserType,
			permissions,
		};
	}

	/**
	 * Resolve permission codes for the JWT payload (string[]).
	 */
	private async resolvePermissionCodes(
		userId: string,
		tenantId: string,
		userType: UserType,
		tenantUserType: TenantUserType,
		isSystemTenant: boolean,
	): Promise<string[]> {
		if (isSystemTenant) return [];

		const isFullAccess =
			userType === UserType.ADMIN ||
			tenantUserType === TenantUserType.OWNER ||
			tenantUserType === TenantUserType.ADMIN;

		const enabledRoleIds =
			await this.tenantRolesService.getEnabledRoleIds(tenantId);

		if (isFullAccess) {
			return this.resolveFullAccessPermissionCodes(enabledRoleIds);
		}

		return this.resolveUserPermissionCodes(
			userId,
			tenantId,
			enabledRoleIds,
		);
	}

	private async resolveFullAccessPermissionCodes(
		enabledRoleIds: string[] | null,
	): Promise<string[]> {
		if (enabledRoleIds === null) {
			const allPermissions = await this.permissionService.getAll();
			return allPermissions.map((p) => p.code);
		}
		if (enabledRoleIds.length === 0) return [];

		const results = await this.userRoleRepository.manager
			.createQueryBuilder(Role, 'role')
			.leftJoin('role.rolePermissions', 'rolePermissions')
			.leftJoin('rolePermissions.permission', 'permission')
			.select(['permission.code AS code'])
			.distinct()
			.where('role.id IN (:...enabledRoleIds)', { enabledRoleIds })
			.andWhere('role.isActive = :isActive', { isActive: true })
			.andWhere('permission.id IS NOT NULL')
			.getRawMany();

		return results.map((r) => r.code);
	}

	private async resolveUserPermissionCodes(
		userId: string,
		tenantId: string,
		enabledRoleIds: string[] | null,
	): Promise<string[]> {
		const query = this.userRoleRepository
			.createQueryBuilder('userRole')
			.leftJoin('userRole.role', 'role')
			.leftJoin('role.rolePermissions', 'rolePermissions')
			.leftJoin('rolePermissions.permission', 'permission')
			.select(['permission.code AS code'])
			.distinct()
			.where('userRole.tenantId = :tenantId', { tenantId })
			.andWhere('userRole.userId = :userId', { userId })
			.andWhere('role.isActive = :isActive', { isActive: true })
			.andWhere('permission.id IS NOT NULL');

		if (enabledRoleIds !== null) {
			if (enabledRoleIds.length === 0) return [];
			query.andWhere('role.id IN (:...enabledRoleIds)', {
				enabledRoleIds,
			});
		}

		const results = await query.getRawMany();
		return results.map((r: { code: string }) => r.code);
	}

	/**
	 * Full-access users: return Permission entities from all active enabled roles.
	 */
	private async resolveFullAccessPermissionEntities(
		enabledRoleIds: string[] | null,
	): Promise<Permission[]> {
		if (enabledRoleIds === null) {
			return this.permissionService.getAll();
		}
		if (enabledRoleIds.length === 0) return [];

		return this.userRoleRepository.manager
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
			.andWhere('role.isActive = :isActive', { isActive: true })
			.andWhere('permission.id IS NOT NULL')
			.getRawMany();
	}

	/**
	 * Normal users: return Permission entities from their assigned active roles.
	 */
	private async resolveUserPermissionEntities(
		userId: string,
		tenantId: string,
		enabledRoleIds: string[] | null,
	): Promise<Permission[]> {
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
			.andWhere('role.isActive = :isActive', { isActive: true })
			.andWhere('permission.id IS NOT NULL');

		if (enabledRoleIds !== null) {
			if (enabledRoleIds.length === 0) return [];
			query.andWhere('role.id IN (:...enabledRoleIds)', {
				enabledRoleIds,
			});
		}

		return query.getRawMany();
	}
}
