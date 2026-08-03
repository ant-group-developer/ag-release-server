import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TenantUser } from 'src/modules/user/entities/tenant-user.entity';
import { UserType } from 'src/modules/user/enum/user.enum';
import {
	checkIsNotSystemTenant,
	checkIsTenantOwnerOrAdmin,
} from 'src/modules/user/utils/user-type.util';
import { Repository } from 'typeorm';
import { ChannelException } from '../constants/channel.constant';
import { Channel } from '../entities/channel.entity';
import { UserChannel } from '../entities/user-channel.entity';

@Injectable()
export class ChannelAccessGuard implements CanActivate {
	constructor(
		@InjectRepository(Channel)
		private readonly channelRepo: Repository<Channel>,
		@InjectRepository(UserChannel)
		private readonly userChannelRepo: Repository<UserChannel>,
		@InjectRepository(TenantUser)
		private readonly tenantUserRepo: Repository<TenantUser>,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest();
		const user = request.user;
		const channelId = request.params?.id || request.params?.channelId;

		if (!channelId || !user?.id) return true;
		if (!checkIsNotSystemTenant(user?.tenantId)) return true;
		if (user?.type === UserType.ADMIN) return true;

		const channel = await this.channelRepo.findOne({
			where: { id: channelId },
		});

		if (!channel) throw ChannelException.CHANNEL_NOT_FOUND();

		if (channel.tenantId && channel.tenantId !== user?.tenantId) {
			throw ChannelException.CHANNEL_WORKSPACE_MISMATCH();
		}

		const tenantUser = await this.tenantUserRepo.findOne({
			where: { userId: user.id, tenantId: user.tenantId },
		});

		if (!tenantUser) {
			throw ChannelException.CHANNEL_WORKSPACE_MISMATCH();
		}

		// Owner và Admin workspace mặc định có full quyền xem kênh active
		if (checkIsTenantOwnerOrAdmin(tenantUser.type)) return true;

		if (!channel.isActive) {
			throw ChannelException.CHANNEL_NOT_FOUND();
		}

		// 4. Voz member thuong: Check xem user co duoc gan channel khong
		const isAssigned = await this.userChannelRepo.exists({
			where: { channelId, userId: user.id },
		});

		if (!isAssigned) {
			throw ChannelException.USER_NOT_ASSIGNED_TO_CHANNEL();
		}

		return true;
	}
}
