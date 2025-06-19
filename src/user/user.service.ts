import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/user.dto';
import { User } from './entities/user.entity';
import { IUserService } from './interface/user.interface';

@Injectable()
export class UserService implements IUserService {
	constructor(
		@InjectRepository(User)
		private readonly userRepository: Repository<User>,
	) {}

	async createUser(data: CreateUserDto): Promise<User> {
		// data.password = await hashPassword(data.password);
		// const newUser = await this.saveToDatabase(data);
		// const { password, ...otherData } = newUser;
		// return otherData;
		const newUser = await this.saveToDatabase(data);

		return newUser;
	}

	// async findOne(data: LoginDto): Promise<User> {
	// 	const { userName } = data;

	// 	const user = await this.userRepository.findOne({
	// 		where: { userName },
	// 	});

	// 	if (!user) {
	// 		throw new NotFoundException('User not found');
	// 	}

	// 	return user;
	// }

	async saveToDatabase(data: CreateUserDto): Promise<User> {
		const user = this.userRepository.create(data);
		return await this.userRepository.save(user);
	}
}
