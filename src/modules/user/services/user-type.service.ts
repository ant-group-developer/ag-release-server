import { Injectable } from '@nestjs/common';
import { TenantUserType, UserType } from '../enum/user.enum';
import { TenantUserService } from './tenant-user.service';
import { UserService } from './user.service';

@Injectable()
export class UserTypeService {
	constructor(
		private readonly userService: UserService,
		private readonly tenantUserService: TenantUserService,
	) {}

	async checkIsTenantAdmin(
		tenantId: string,
		userId: string,
	): Promise<boolean> {
		const data = await this.tenantUserService.findOne(tenantId, userId);
		return data?.type === TenantUserType.ADMIN;
	}

	async checkIsTenantOwner(
		tenantId: string,
		userId: string,
	): Promise<boolean> {
		const data = await this.tenantUserService.findOne(tenantId, userId);
		return data?.type === TenantUserType.OWNER;
	}

	async checkIsTenantOwnerOrAdmin(
		tenantId: string,
		userId: string,
	): Promise<boolean> {
		const data = await this.tenantUserService.findOne(tenantId, userId);
		return (
			!!data &&
			[TenantUserType.OWNER, TenantUserType.ADMIN].includes(data?.type)
		);
	}

	async checkIsSystemAdmin(id: string): Promise<boolean> {
		const user = await this.userService.findOne(id, {
			select: ['id', 'type'],
		});
		return user.type === UserType.ADMIN;
	}

	async checkCanAccessTenantAll(
		tenantId: string,
		userId: string,
	): Promise<boolean> {
		const isAdmin = await this.checkIsSystemAdmin(userId);
		if (isAdmin) {
			return true;
		}
		return this.checkIsTenantOwnerOrAdmin(tenantId, userId);
	}

	async getTenantType(
		tenantId: string,
		userId: string,
	): Promise<TenantUserType> {
		const data = await this.tenantUserService.checkMembership(
			tenantId,
			userId,
		);
		return data.type;
	}
}
