import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
	PageDto,
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
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
	private readonly logger = new Logger(PermissionService.name);

	constructor(
		@InjectRepository(Permission)
		private readonly permissionRepo: Repository<Permission>,

		private readonly permissionQueryService: PermissionQueryService,
	) {}

	// create
	async create(
		data: CreatePermissionDto,
		userId: string,
	): Promise<Permission> {
		await this.permissionQueryService.validate(data);

		const permission = this.permissionRepo.create({
			...data,
			creatorId: userId,
			modifierId: userId,
		});
		return await this.permissionRepo.save(permission);
	}

	async createSafe(data: CreatePermissionDto, userId: string) {
		try {
			const entity = await this.create(data, userId);
			return { entity, messageWarning: null };
		} catch (error) {
			const messageWarning =
				error?.response?.messageWarning ?? 'Unknown error';
			this.logger.error(messageWarning);
			return { entity: null, messageWarning };
		}
	}

	async bulkCreate(data: BulkCreatePermissionDto, userId: string) {
		const { permissions } = data;

		const result = await Promise.all(
			permissions.map((item) => this.createSafe(item, userId)),
		);

		return new ResponseSuccess({
			data: result
				.filter((item) => item.entity !== null)
				.map((item) => item.entity),
			messageWarning: result
				.filter((item) => item.messageWarning !== null)
				.map((item) => item.messageWarning)
				.join('\n'),
		});
	}

	// read
	async findOne(id: string): Promise<Permission> {
		const permission = await this.permissionRepo.findOne({ where: { id } });
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

	async getAll() {
		return this.permissionRepo.find({
			select: ['id', 'name', 'code', 'note'],
			cache: {
				id: 'permissions',
				milliseconds: 1000 * 60 * 10,
			},
		});
	}

	// update
	async update(
		id: string,
		data: UpdatePermissionDto,
		userId: string,
	): Promise<Permission> {
		const { name, code } = data;

		const permission = await this.findOne(id);

		if (name && name !== permission.name) {
			await this.permissionQueryService.validate({ name });
		}

		if (code && code !== permission.code) {
			await this.permissionQueryService.validate({ code });
		}

		await this.permissionRepo.update(id, { ...data, modifierId: userId });
		return await this.findOne(id);
	}

	// delete
	async bulkDelete(data: BulkDeletePermissionDto) {
		const { ids } = data;

		const messageWarnings = await Promise.all(
			ids.map((id) => this.deleteSafe(id)),
		);

		return new ResponseSuccess({
			messageWarning: messageWarnings.join('\n'),
		});
	}

	async deleteSafe(id: string) {
		try {
			await this.delete(id);
		} catch (error) {
			const messageWarning = error?.response?.messageWarning;
			this.logger.error(messageWarning);
			return messageWarning;
		}
	}

	async delete(id: string): Promise<void> {
		await this.permissionRepo.delete(id);
	}
}
