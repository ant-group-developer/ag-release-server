import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { PermissionMessageError } from '../constants/permission.constant';
import {
	BulkCreatePermissionDto,
	BulkDeletePermissionDto,
	CreatePermissionDto,
	QueryGetListPermissionDto,
	UpdatePermissionDto,
} from '../dto/permission.dto';
import { Permission } from '../entities/permission.entity';
import { PermissionQueryService } from './permission.query.service';

@Injectable()
export class PermissionService {
	constructor(
		@InjectRepository(Permission)
		private readonly permissionRepo: Repository<Permission>,

		private readonly permissionQueryService: PermissionQueryService,
	) {}

	// create
	async create(data: CreatePermissionDto): Promise<Permission> {
		await this.permissionQueryService.validate(data);

		const permission = this.permissionRepo.create(data);
		return await this.permissionRepo.save(permission);
	}

	async bulkCreate(data: BulkCreatePermissionDto) {
		const { permissions } = data;

		const errorMessages: string[] = [];

		const results = await Promise.all(
			permissions.map((p) =>
				this.create(p).catch((e) => {
					errorMessages.push(
						`"${p.name}" skipped. Reason: ${e.message}`,
					);
					return null;
				}),
			),
		);

		return {
			data: results.filter((item): item is Permission => item !== null),
			message: errorMessages.join('\n'),
		};
	}

	// read
	async findOne(id: string): Promise<Permission> {
		const permission = await this.permissionRepo.findOne({ where: { id } });
		if (!permission) {
			throw new ResponseError({ message: 'Permission not found' });
		}

		return permission;
	}

	async findOneWithCountRelation(id: string) {
		const permission =
			await this.permissionQueryService.findOneWithCountRelation(id);

		if (!permission) {
			throw new ResponseError({ message: 'Permission not found' });
		}

		return permission;
	}

	async getList(
		query: QueryGetListPermissionDto,
	): Promise<PageDto<Permission>> {
		const { pageSize, page } = query;

		const [permissions, totalItems] =
			await this.permissionQueryService.getManyAndCount(query);

		return new PageDto({
			items: permissions,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	// update
	async update(id: string, data: UpdatePermissionDto): Promise<Permission> {
		await this.permissionQueryService.validate(data);

		await this.permissionRepo.update(id, data);
		return await this.findOne(id);
	}

	// delete
	async delete(id: string): Promise<void> {
		const permission = await this.findOneWithCountRelation(id);

		if ((permission.userCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					PermissionMessageError.CANNOT_DELETE_BECAUSE_LINKED_USERS,
				messageCode:
					PermissionMessageError.CANNOT_DELETE_BECAUSE_LINKED_USERS,
				statusCode: 400,
			});
		}

		await this.permissionRepo.delete(id);
	}

	async bulkDelete(data: BulkDeletePermissionDto) {
		const { ids } = data;

		const errorMessages: string[] = [];

		await Promise.all(
			ids.map((id) =>
				this.delete(id).catch((e) => {
					errorMessages.push(`"${id}" skipped. Reason: ${e.message}`);
				}),
			),
		);

		return {
			message: errorMessages.join('\n'),
		};
	}
}
