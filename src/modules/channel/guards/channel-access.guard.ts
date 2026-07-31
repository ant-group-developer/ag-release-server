import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TenantUser } from 'src/modules/user/entities/tenant-user.entity';
import { TenantUserType, UserType } from 'src/modules/user/enum/user.enum';
import { checkIsNotSystemTenant } from 'src/modules/user/utils/user-type.util';
import { Repository } from 'typeorm';
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

		if (!channel) throw new NotFoundException('Kênh không tồn tại');

		if (channel.tenantId && channel.tenantId !== user?.tenantId) {
			throw new ForbiddenException(
				'Bạn không thuộc Workspace sở hữu kênh này',
			);
		}

		const tenantUser = await this.tenantUserRepo.findOne({
			where: { userId: user.id, tenantId: user.tenantId },
		});

		if (!tenantUser) {
			throw new ForbiddenException(
				'Bạn không thuộc Workspace sở hữu kênh này',
			);
		}

		// Owner và Admin workspace mặc định có full quyền xem kênh active
		if (
			tenantUser.type === TenantUserType.OWNER ||
			tenantUser.type === TenantUserType.ADMIN
		) {
			return true;
		}

		if (!channel.isActive) {
			throw new NotFoundException('Kênh không tồn tại');
		}

		// 4. Voz member thuong: Check xem user co duoc gan channel khong
		const isAssigned = await this.userChannelRepo.exists({
			where: { channelId, userId: user.id },
		});

		if (!isAssigned) {
			throw new ForbiddenException(
				'Bạn không có quyền truy cập vào kênh này',
			);
		}

		return true;
	}
}
