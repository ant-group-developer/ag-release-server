import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	CreateUserDto,
	QueryGetListUserDto,
	UpdateUserDto,
} from './dto/user.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UserService {
	@InjectRepository(User)
	private readonly userRepo: Repository<User>;

	async create(createUserDto: CreateUserDto): Promise<User> {
		const user = this.userRepo.create(createUserDto);
		return await this.userRepo.save(user);
	}

	async findOne(id: string): Promise<User> {
		const user = await this.userRepo.findOne({ where: { id } });
		if (!user) {
			throw new BadRequestException('Not found');
		}

		console.log(user.organization);

		return user;
	}

	async getList(query: QueryGetListUserDto): Promise<PageDto<User>> {
		const { page, pageSize, skip } = query;

		const [users, totalItems] = await this.userRepo.findAndCount({
			skip,
			take: pageSize,
		});

		return new PageDto({
			items: users,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
		await this.userRepo.update(id, updateUserDto);
		return await this.findOne(id);
	}

	async remove(id: string): Promise<void> {
		await this.userRepo.delete(id);
	}
}
