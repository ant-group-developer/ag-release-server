import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	CreatePermissionDto,
	QueryGetListPermissionDto,
	UpdatePermissionDto,
} from './dto/permission.dto';
import { Permission } from './entities/permission.entity';

@Injectable()
export class PermissionService {
	constructor(
		@InjectRepository(Permission)
		private readonly permissionRepo: Repository<Permission>,
	) {}

	async create(
		createPermissionDto: CreatePermissionDto,
	): Promise<Permission> {
		const permission = this.permissionRepo.create(createPermissionDto);
		return await this.permissionRepo.save(permission);
	}

	async findOne(id: string): Promise<Permission> {
		const permission = await this.permissionRepo.findOne({ where: { id } });
		if (!permission) {
			throw new BadRequestException('Not found');
		}

		return permission;
	}

	async getList(
		query: QueryGetListPermissionDto,
	): Promise<PageDto<Permission>> {
		const { page, pageSize, skip } = query;

		const [permissions, totalItems] =
			await this.permissionRepo.findAndCount({
				skip,
				take: pageSize,
			});

		return new PageDto({
			items: permissions,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(
		id: string,
		updatePermissionDto: UpdatePermissionDto,
	): Promise<Permission> {
		await this.permissionRepo.update(id, updatePermissionDto);
		return await this.findOne(id);
	}

	async remove(id: string): Promise<void> {
		await this.permissionRepo.delete(id);
	}
}
