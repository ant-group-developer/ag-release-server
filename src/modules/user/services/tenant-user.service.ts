import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantUser } from '../entities/tenant-user.entity';
import { TenantUserType } from '../enum/user.enum';
import { UserService } from './user.service';

@Injectable()
export class TenantUserService {
	constructor(
		@InjectRepository(TenantUser)
		private readonly tenantUserRepository: Repository<TenantUser>,
		private readonly userService: UserService,
	) {}

	async addUserToTenant(
		tenantId: string,
		userId: string,
		type: TenantUserType,
	): Promise<TenantUser> {
		await this.userService.findOne(userId);
		const tenantUser = this.tenantUserRepository.create({
			tenantId,
			userId,
			type,
		});
		return this.tenantUserRepository.save(tenantUser);
	}

	async updateUserTenantType(
		tenantId: string,
		userId: string,
		type: TenantUserType,
	): Promise<TenantUser> {
		const tenantUser = await this.tenantUserRepository.findOne({
			where: { tenantId, userId },
		});
		if (!tenantUser) {
			throw new ForbiddenException('User is not part of this tenant');
		}
		tenantUser.type = type;
		return this.tenantUserRepository.save(tenantUser);
	}

	async inviteUserToTenant(
		tenantId: string,
		email: string,
		type: TenantUserType,
	): Promise<TenantUser> {
		const user = await this.userService.findOneByEmail(email);
		const tenantUser = this.tenantUserRepository.create({
			tenantId,
			userId: user.id,
			type,
		});
		return this.tenantUserRepository.save(tenantUser);
	}
}
