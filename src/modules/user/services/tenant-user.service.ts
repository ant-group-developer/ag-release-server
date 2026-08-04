import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { AccessControlService } from 'src/modules/access-control/access-control.service';
import { UserChannel } from 'src/modules/channel/entities/user-channel.entity';
import { TenantService } from 'src/modules/tenant/tenant.service';
import { In, Repository } from 'typeorm';
import { UserMessages } from '../constants/messages';
import { BulkUpdateTenantUserDto } from '../dto/user.dto';
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
		@InjectRepository(UserChannel)
		private readonly userChannelRepo: Repository<UserChannel>,
		@Inject(forwardRef(() => TenantService))
		private readonly tenantService: TenantService,
		@Inject(forwardRef(() => AccessControlService))
		private readonly accessControlService: AccessControlService,
	) {}

	async getDefaultTenant(userId: string) {
		const data = await this.tenantUserRepository.find({
			where: {
				userId,
				tenant: {
					isActive: true,
				},
			},
			relations: {
				tenant: true,
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
			relations: {
				tenant: true,
			},
			select: {
				tenant: {
					id: true,
					name: true,
					type: true,
				},
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
	}

	async checkMembership(tenantId: string, userId: string) {
		return this.validateExist(tenantId, userId);
	}

	async addUserToTenant(
		tenantId: string,
		userId: string,
		type: TenantUserType,
		userReqId: string,
	): Promise<TenantUser> {
		const tenantUser = this.tenantUserRepository.create({
			tenantId,
			userId,
			type,
			creatorId: userReqId,
			modifierId: userReqId,
		});
		const result = await this.tenantUserRepository.save(tenantUser);

		// Invalidate auth cache for this user in this tenant
		await this.accessControlService.invalidateAuthContext(userId, tenantId);

		return result;
	}

	async updateUserTenantType(
		tenantId: string,
		userId: string,
		type: TenantUserType,
	): Promise<TenantUser> {
		const tenantUser = await this.checkMembership(tenantId, userId);
		tenantUser.type = type;
		const result = await this.tenantUserRepository.save(tenantUser);

		// Invalidate auth cache — tenant user type changed
		await this.accessControlService.invalidateAuthContext(userId, tenantId);

		return result;
	}

	async inviteUserToTenant(
		tenantId: string,
		email: string,
		type: TenantUserType,
		userReqId: string,
	): Promise<TenantUser> {
		const user = await this.userService.findOneByEmail(email);
		await this.checkExisted(tenantId, user.id);
		return this.addUserToTenant(tenantId, user.id, type, userReqId);
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
				!checkIsTenantOwner(req.user!.tenantUserType)) &&
			checkIsTenantAdmin(tenantUser.type)
		) {
			throw new ResponseError(
				UserMessages.TENANT.DELETE.DECLINE_DELETE_TENANT_ADMIN,
			);
		}

		await this.userChannelRepo.delete({ tenantId, userId });

		return this.tenantUserRepository
			.delete({ tenantId, userId })
			.then(async (result) => {
				// Invalidate auth cache — user removed from tenant
				await this.accessControlService.invalidateAuthContext(
					userId,
					tenantId,
				);
				return result;
			});
	}

	async bulkUpdateTenantUser(
		{ userId, data }: BulkUpdateTenantUserDto,
		userReqId: string,
	) {
		await this.userService.findOne(userId);
		await this.tenantService.validateExisted(
			data.map((item) => item.tenantId),
		);
		await this.tenantUserRepository.delete({
			type: In([TenantUserType.ADMIN, TenantUserType.MEMBER]),
			userId,
		});
		const newData = data.map((item) =>
			this.tenantUserRepository.create({
				tenantId: item.tenantId,
				type: item.type,
				userId,
				creatorId: userReqId,
				modifierId: userReqId,
			}),
		);
		const result = await this.tenantUserRepository.save(newData);

		// Invalidate all auth contexts for this user (tenants changed)
		await this.accessControlService.invalidateAuthContext(userId);

		return result;
	}

	async removeCurrentOwner(tenantId: string) {
		await this.tenantUserRepository.delete({
			tenantId,
			type: TenantUserType.OWNER,
		});
	}

	async updateOwner(tenantId: string, ownerId: string, userReqId: string) {
		await this.userService.findOne(ownerId);
		const tenantUser = await this.findOne(tenantId, ownerId);
		if (tenantUser) {
			if (checkIsTenantOwner(tenantUser.type)) {
				return tenantUser;
			} else {
				await this.removeCurrentOwner(tenantId);
				tenantUser.type = TenantUserType.OWNER;
				const result = await this.tenantUserRepository.save(tenantUser);

				// Invalidate — owner changed
				await this.accessControlService.invalidateAuthContext(
					undefined,
					tenantId,
				);

				return result;
			}
		} else {
			await this.removeCurrentOwner(tenantId);
			const result = await this.addUserToTenant(
				tenantId,
				ownerId,
				TenantUserType.OWNER,
				userReqId,
			);

			// Invalidate — owner changed
			await this.accessControlService.invalidateAuthContext(
				undefined,
				tenantId,
			);

			return result;
		}
	}

	async checkIsOwnerParentTenant(userId: string, parentTenantId?: string) {
		if (!parentTenantId) {
			return false;
		}
		const data = await this.tenantUserRepository.findOne({
			where: {
				tenantId: parentTenantId,
				type: TenantUserType.OWNER,
				userId,
			},
		});
		return Boolean(data);
	}
}
