import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { UserMessages } from '../constants/messages';
import { TenantUser } from '../entities/tenant-user.entity';
import { TenantUserType } from '../enum/user.enum';
import {
	checkIsSystemAdmin,
	checkIsTenantAdmin,
	checkIsTenantOwner,
} from '../utils/user-type.util';
import { UserService } from './user.service';

@Injectable()
export class TenantUserService {
	constructor(
		@InjectRepository(TenantUser)
		private readonly tenantUserRepository: Repository<TenantUser>,
		private readonly userService: UserService,
	) {}

	async getDefaultTenant(userId: string) {
		const data = await this.tenantUserRepository.find({
			where: {
				userId,
			},
			select: {
				tenantId: true,
				userId: true,
				type: true,
			},
		});

		let tenantAdmin: TenantUser | undefined = undefined;
		let tenantDefault: TenantUser | undefined = undefined;
		for (const item of data) {
			if (checkIsTenantOwner(item.type)) {
				return item;
			} else if (checkIsTenantAdmin(item.type)) {
				tenantAdmin = item;
			} else {
				tenantDefault = item;
			}
		}
		return tenantAdmin || tenantDefault;
	}

	async findOne(tenantId: string, userId: string) {
		return this.tenantUserRepository.findOne({
			where: {
				tenantId,
				userId,
			},
		});
	}

	async validateExist(tenantId: string, userId: string) {
		const tenantUser = await this.findOne(tenantId, userId);
		if (!tenantUser) {
			throw new ResponseError(UserMessages.TENANT.FORBIDDEN);
		}
		return tenantUser;
	}

	async checkExisted(tenantId: string, userId: string) {
		const existData = await this.findOne(tenantId, userId);
		if (existData) {
			throw new ResponseError(UserMessages.TENANT.CONFLICT);
		}
		return existData;
	}

	async checkMembership(tenantId: string, userId: string) {
		return this.validateExist(tenantId, userId);
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

	async remove(req: Request, userId: string) {
		const tenantId = req.user!.tenantId;

		const user = await this.userService.findOne(userId);
		if (checkIsSystemAdmin(user.type)) {
			throw new ResponseError(
				UserMessages.TENANT.DELETE.DECLINE_DELETE_SYSTEM_ADMIN,
			);
		}

		const tenantUser = await this.validateExist(tenantId, userId);
		if (checkIsTenantOwner(tenantUser.type)) {
			throw new ResponseError(
				UserMessages.TENANT.DELETE.DECLINE_DELETE_TENANT_OWNER,
			);
		}

		if (
			(!checkIsSystemAdmin(req.user!.type) ||
				!checkIsTenantOwner(req.user!.tenantType)) &&
			checkIsTenantAdmin(tenantUser.type)
		) {
			throw new ResponseError(
				UserMessages.TENANT.DELETE.DECLINE_DELETE_TENANT_ADMIN,
			);
		}

		return this.tenantUserRepository.delete({ tenantId, userId });
	}
}
