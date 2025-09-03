import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'argon2';
import { isUUID } from 'class-validator';
import { Request } from 'express';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Brackets, FindOneOptions, Repository } from 'typeorm';
import { UserMessages } from '../constants/messages';
import { CreateUserDto, GetListUserDto, UpdateUserDto } from '../dto/user.dto';
import { User } from '../entities/user.entity';
import { getAvatarUrl } from '../utils/user-ava.util';
import { checkIsSystemTenant } from '../utils/user-type.util';

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

	async create(payload: CreateUserDto, userReqId: string): Promise<User> {
		const {
			email,
			password,
			name,
			avatar,
			emailVerified,
			isActive,
			telegramId,
			type,
		} = payload;

		const formattedEmail = email.toLowerCase();
		await this.checkEmailUniqueness(formattedEmail);

		const hashedPassword = await this.hashPassword(password);

		const user = this.userRepository.create({
			name,
			isActive,
			telegramId,
			type,
			email: formattedEmail,
			password: hashedPassword,
			emailVerified: emailVerified ?? true,
			avatar: avatar || getAvatarUrl(formattedEmail),
			creatorId: userReqId,
			modifierId: userReqId,
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
			throw new ResponseError(UserMessages.NOT_FOUND);
		}
		return user;
	}

	checkActive(isActive: boolean) {
		if (!isActive) throw new ResponseError(UserMessages.BLOCKED);
	}

	async findOneByEmail(
		email: string,
		options?: FindOneOptions<User>,
	): Promise<User> {
		const user = await this.userRepository.findOne({
			...options,
			select: {
				...options?.select,
				id: true,
				email: true,
				isActive: true,
				password: true,
			},
			where: { ...options?.where, email },
		});
		if (!user) {
			throw new ResponseError(UserMessages.NOT_FOUND);
		}
		return user;
	}

	async getList(query: GetListUserDto, req: Request): Promise<PageDto<User>> {
		const {
			page,
			pageSize,
			skip,
			type,
			keyword,
			id,
			orderBy,
			fieldOrder,
			tenantIds,
			status,
		} = query;

		const tenantId = req.user!.tenantId;

		const queryBuilder = this.userRepository.createQueryBuilder('user');

		if (checkIsSystemTenant(tenantId)) {
			queryBuilder.leftJoin('user.tenantUser', 'tenantUser');
		} else {
			queryBuilder.innerJoin(
				'user.tenantUser',
				'tenantUser',
				'tenantUser.tenantId = :tenantId',
				{ tenantId },
			);
		}
		queryBuilder
			.leftJoin('tenantUser.tenant', 'tenant')
			.select([
				'user.id',
				'user.name',
				'user.email',
				'user.avatar',
				'user.type',
				'user.isActive',
				'user.lastLogin',
				'user.lastActive',
				'user.createdAt',
				'user.updatedAt',
				'tenantUser.id',
				'tenantUser.type',
				'tenant.id',
				'tenant.name',
			])
			.skip(skip)
			.take(pageSize)
			.orderBy(`user.${fieldOrder}`, orderBy);

		if (isUUID(id)) {
			queryBuilder.andWhere('user.id = :id', { id });
		}

		if (type?.length) {
			queryBuilder.andWhere('user.type IN (:...type)', { type });
		}

		if (tenantIds?.length) {
			queryBuilder.andWhere('tenantUser.tenantId IN (:...tenantIds)', {
				tenantIds,
			});
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

		if (status?.length) {
			queryBuilder.andWhere('user.isActive IN (:...status)', {
				status,
			});
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

	async update(
		id: string,
		payload: UpdateUserDto,
		userReqId: string,
	): Promise<User> {
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
			modifierId: userReqId,
		});

		return this.findOne(savedData.id);
	}

	updateLastActive(userId: string) {
		try {
			this.userRepository.update(userId, {
				lastActive: new Date(),
			});
		} catch (error) {
			console.log('error:', error);
		}
	}

	updateLastLogin(userId: string) {
		try {
			this.userRepository.update(userId, { lastLogin: new Date() });
		} catch (error) {
			console.log('error:', error);
		}
	}
}
