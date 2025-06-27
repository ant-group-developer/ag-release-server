import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Permission } from 'src/modules/permission/entities/permission.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Repository } from 'typeorm';

@Injectable()
export class UserPermissionValidateService {
	constructor(
		@InjectRepository(User)
		private readonly userRepo: Repository<User>,

		@InjectRepository(Permission)
		private readonly permissionRepo: Repository<Permission>,
	) {}

	async validate({
		userId,
		permissionId,
	}: {
		userId: string;
		permissionId: string;
	}) {
		const user = await this.userRepo.findOne({ where: { id: userId } });
		const permission = await this.permissionRepo.findOne({
			where: { id: permissionId },
		});

		if (!user || !permission) {
			throw new NotFoundException('User or Permission not found');
		}

		return true;
	}
}
