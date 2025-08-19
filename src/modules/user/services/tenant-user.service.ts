import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { UserMessages } from '../constants/messages';
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

	async findOne(tenantId: string, userId: string) {
		return this.tenantUserRepository.findOne({
			where: {
				tenantId,
				userId,
			},
		});
	}

	async checkExisted(tenantId: string, userId: string) {
		const existData = await this.findOne(tenantId, userId);
		if (existData) {
			throw new ResponseError(UserMessages.TENANT.CONFLICT);
		}
		return existData;
	}

	async checkMembership(tenantId: string, userId: string) {
		const tenantUser = await this.findOne(tenantId, userId);
		if (!tenantUser) {
			throw new ResponseError(UserMessages.TENANT.FORBIDDEN);
		}
		return tenantUser;
	}

	async addUserToTenant(
		tenantId: string,
		userId: string,
		type: TenantUserType,
	): Promise<TenantUser> {
		await this.userService.findOne(userId);
		await this.checkExisted(tenantId, userId);
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
		const tenantUser = await this.checkMembership(tenantId, userId);
		tenantUser.type = type;
		return this.tenantUserRepository.save(tenantUser);
	}

	async inviteUserToTenant(
		tenantId: string,
		email: string,
		type: TenantUserType,
	): Promise<TenantUser> {
		const user = await this.userService.findOneByEmail(email);
		await this.checkExisted(tenantId, user.id);
		const tenantUser = this.tenantUserRepository.create({
			tenantId,
			userId: user.id,
			type,
		});
		return this.tenantUserRepository.save(tenantUser);
	}
}
