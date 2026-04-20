import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleService } from '../role/services/role.service';
import { TenantService } from '../tenant/tenant.service';
import { TenantRole } from './tenant-role.entity';
import { UpdateTenantRolesDto } from './tenant-roles.dto';

@Injectable()
export class TenantRolesService {
	constructor(
		@InjectRepository(TenantRole)
		private readonly tenantRoleRepository: Repository<TenantRole>,
		private readonly roleService: RoleService,
		private readonly tenantService: TenantService,
	) {}

	async update(tenantId: string, { data }: UpdateTenantRolesDto) {
		await this.roleService.validateExisted(
			data.map((item) => item.roleId),
		);
		await this.tenantService.validateExisted(tenantId);

		await this.tenantRoleRepository.delete({ tenantId });
		const newData = this.tenantRoleRepository.create(
			data.map(({ roleId, isActive }) => ({
				tenantId,
				roleId,
				isActive,
			})),
		);
		return this.tenantRoleRepository.save(newData);
	}

	async get(tenantId: string) {
		return this.tenantRoleRepository.find({
			where: { tenantId },
			relations: { role: true },
			select: {
				id: true,
				tenantId: true,
				isActive: true,
				role: {
					id: true,
					name: true,
					code: true,
					color: true,
					note: true,
				},
			},
		});
	}

	/**
	 * Returns the IDs of roles enabled for a tenant.
	 * If no tenant_roles records exist (unconfigured), returns
	 * only roles marked as `isDefault` (restrictive default).
	 */
	async getEnabledRoleIds(tenantId: string): Promise<string[] | null> {
		const records = await this.tenantRoleRepository.find({
			where: { tenantId },
			select: ['roleId', 'isActive'],
		});

		// Restrictive default: no records = only default roles allowed
		if (records.length === 0) {
			const defaultRoles = await this.roleService.getDefaultRoleIds();
			return defaultRoles;
		}

		return records
			.filter((record) => record.isActive)
			.map((record) => record.roleId);
	}
}
