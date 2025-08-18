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
	async create(data: CreatePermissionDto): Promise<Permission> {
		await this.permissionQueryService.validate(data);

		const permission = this.permissionRepo.create(data);
		return await this.permissionRepo.save(permission);
	}

	async createSafe(data: CreatePermissionDto) {
		try {
			const entity = await this.create(data);
			return { entity, messageWarning: null };
		} catch (error) {
			const messageWarning =
				error?.response?.messageWarning ?? 'Unknown error';
			this.logger.error(messageWarning);
			return { entity: null, messageWarning };
		}
	}

	async bulkCreate(data: BulkCreatePermissionDto) {
		const { permissions } = data;

		const result = await Promise.all(
			permissions.map((item) => this.createSafe(item)),
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
		const { name, code } = data;

		const permission = await this.findOne(id);

		if (name && name !== permission.name) {
			await this.permissionQueryService.validate({ name });
		}

		if (code && code !== permission.code) {
			await this.permissionQueryService.validate({ code });
		}

		await this.permissionRepo.update(id, data);
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
		const permission = await this.findOneWithCountRelation(id);
		this.permissionQueryService.validateDelete(permission);
		await this.permissionRepo.delete(id);
	}
}
