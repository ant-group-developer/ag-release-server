import {
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'argon2';
import { isUUID } from 'class-validator';
import { PageDto } from 'src/common/dtos/response.dto';
import { Brackets, FindOneOptions, Repository } from 'typeorm';
import { CreateUserDto, GetListUserDto, UpdateUserDto } from '../dto/user.dto';
import { User } from '../entities/user.entity';
import { getAvatarUrl } from '../user.util';

@Injectable()
export class UserService {
	constructor(
		@InjectRepository(User)
		private readonly userRepository: Repository<User>,
	) {}

	private async checkEmailUniqueness(email: string): Promise<void> {
		const count = await this.userRepository.count({ where: { email } });

		if (count > 0) {
			throw new ConflictException('message.emailAlreadyExist');
		}
	}

	private async hashPassword(password: string): Promise<string> {
		const result = await hash(password);
		return result;
	}

	async create(payload: CreateUserDto): Promise<User> {
		const { email, password } = payload;

		const formattedEmail = email.toLowerCase();
		await this.checkEmailUniqueness(formattedEmail);

		const hashedPassword = await this.hashPassword(password);

		const user = this.userRepository.create({
			...payload,
			email: formattedEmail,
			password: hashedPassword,
			emailVerified: true,
			avatar: getAvatarUrl(formattedEmail),
		});
		const savedData = await this.userRepository.save(user);

		return this.findOne(savedData.id);
	}

	async findOne(id: string, options?: FindOneOptions<User>): Promise<User> {
		const user = await this.userRepository.findOne({
			...options,
			where: { id },
		});
		if (!user) {
			throw new NotFoundException('User not found');
		}
		return user;
	}

	async findOneByEmail(email: string): Promise<User> {
		const user = await this.userRepository.findOne({
			where: { email },
			select: ['id', 'email', 'isActive', 'password'],
		});
		if (!user) {
			throw new NotFoundException('User not found');
		}
		return user;
	}

	async getList(query: GetListUserDto): Promise<PageDto<User>> {
		const { page, pageSize, skip, type, keyword, id, orderBy, fieldOrder } =
			query;

		const queryBuilder = this.userRepository
			.createQueryBuilder('user')
			.leftJoin('user.creator', 'creator')
			.leftJoin('user.modifier', 'modifier')
			.select([
				'user.id',
				'user.name',
				'user.email',
				'user.avatar',
				'user.type',
				'user.isActive',
				'user.lastLogin',
				'user.loginsCount',
				'user.createdAt',
				'user.updatedAt',
				'creator.id',
				'creator.email',
				'modifier.id',
				'modifier.email',
			])
			.skip(skip)
			.take(pageSize)
			.orderBy(`user.${fieldOrder}`, orderBy);

		if (id) {
			if (isUUID(id)) {
				queryBuilder.andWhere('user.id = :id', { id });
			} else {
				queryBuilder.andWhere('user.auth0UserId = :id', { id });
			}
		}

		if (type?.length) {
			queryBuilder.andWhere('user.type IN (:...type)', { type });
		}

		if (keyword) {
			queryBuilder.andWhere(
				new Brackets((qb) => {
					qb.where('user.name ILIKE :keyword', {
						keyword: `%${keyword}%`,
					}).orWhere('user.email ILIKE :keyword', {
						keyword: `%${keyword}%`,
					});
				}),
			);
		}

		const [users, totalItems] = await queryBuilder.getManyAndCount();

		return new PageDto({
			items: users,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(id: string, payload: UpdateUserDto): Promise<User> {
		const { email, password } = payload;

		const user = await this.findOne(id);
		let avatar = user.avatar;

		const formattedEmail = email ? email.toLowerCase() : null;
		if (formattedEmail && formattedEmail !== user.email) {
			await this.checkEmailUniqueness(formattedEmail);
			avatar = getAvatarUrl(formattedEmail);
		}

		const hashedPassword = password
			? await this.hashPassword(password)
			: undefined;

		const savedData = await this.userRepository.save({
			...user,
			...payload,
			email: formattedEmail ?? user.email,
			password: hashedPassword || user.password,
			avatar,
		});

		return this.findOne(savedData.id);
	}
}
