import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/modules/user/entities/user.entity';
import { UserType } from 'src/modules/user/enum/user.enum';
import { Repository } from 'typeorm';

@Injectable()
export class NotificationUserService {
	constructor(
		@InjectRepository(User)
		private readonly userRepository: Repository<User>,
	) {}

	async getListUserDev() {
		const users = await this.userRepository.find({
			where: { type: UserType.USER },
		});

		return users;
	}
}
