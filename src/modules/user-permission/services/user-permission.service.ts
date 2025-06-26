import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	CreateUserPermissionDto,
	QueryGetListUserPermissionDto,
	UpdateUserPermissionDto,
} from '../dto/user-permission.dto';
import { UserPermission } from '../entities/user-permission.entity';
import { UserPermissionValidateService } from './user-permission.validate.service';

@Injectable()
export class UserPermissionService {
	constructor(
		@InjectRepository(UserPermission)
		private readonly userPermissionRepo: Repository<UserPermission>,

		private readonly userPermissionValidateService: UserPermissionValidateService,
	) {}

	async create(
		createUserPermissionDto: CreateUserPermissionDto,
	): Promise<UserPermission> {
		const { userId, permissionId } = createUserPermissionDto;

		await this.userPermissionValidateService.validate({
			userId,
			permissionId,
		});

		const userPermission = this.userPermissionRepo.create(
			createUserPermissionDto,
		);
		return await this.userPermissionRepo.save(userPermission);
	}

	async findOne(id: string): Promise<UserPermission> {
		const userPermission = await this.userPermissionRepo.findOne({
			where: { id },
		});

		if (!userPermission) {
			throw new BadRequestException('Not found');
		}

		return userPermission;
	}

	async getList(
		query: QueryGetListUserPermissionDto,
	): Promise<PageDto<UserPermission>> {
		const { page, pageSize, skip } = query;

		const [userPermissions, totalItems] =
			await this.userPermissionRepo.findAndCount({
				skip,
				take: pageSize,
			});

		return new PageDto({
			items: userPermissions,
			metaData: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(
		id: string,
		updateUserPermissionDto: UpdateUserPermissionDto,
	): Promise<UserPermission> {
		await this.userPermissionRepo.update(id, updateUserPermissionDto);
		return await this.findOne(id);
	}

	async remove(id: string): Promise<void> {
		await this.userPermissionRepo.delete(id);
	}
}
