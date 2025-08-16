import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	PermissionMessageCodeError,
	PermissionMessageError,
} from '../constants/permission.constant';
import { QueryGetListPermissionDto } from '../dto/permission.dto';
import { Permission } from '../entities/permission.entity';

@Injectable()
export class PermissionQueryService {
	constructor(
		@InjectRepository(Permission)
		private readonly permissionRepo: Repository<Permission>,
	) {}

	async findOneWithCountRelation(id: string) {
		const query = this.permissionRepo.createQueryBuilder('permission');

		// virtual
		query.addSelect((subQuery) => {
			return subQuery
				.select('COUNT(user_permission.id)')
				.from('user_permissions', 'user_permission')
				.where('user_permission.permission_id = permission.id');
		}, 'user_count');

		query.addSelect((subQuery) => {
			return subQuery
				.select('COUNT(role_permission.id)')
				.from('role_permission', 'role_permission')
				.where('role_permission.permission_id = permission.id');
		}, 'role_permission_count');

		query.where('permission.id = :id', { id });

		const dataFromDb: {
			raw: {
				permission_id: string;
				user_count: string;
				role_permission_count: string;
			}[];
			entities: Permission[];
		} = await query.getRawAndEntities();

		const permissions = this.assigneeVirtualColumn(dataFromDb);
		return permissions[0];
	}

	private assigneeVirtualColumn(dataFromDb: {
		raw: {
			permission_id: string;
			user_count: string;
			role_permission_count: string;
		}[];
		entities: Permission[];
	}) {
		return dataFromDb.entities.map((entity) => {
			const dataRaw = dataFromDb.raw.find(
				(item) => item.permission_id === entity.id,
			);

			entity.userCount = Number(dataRaw?.user_count);
			entity.rolePermissionCount = Number(dataRaw?.role_permission_count);
			return entity;
		});
	}

	async getManyAndCount(query: QueryGetListPermissionDto) {
		const queryGetList = this.createQueryGetList(query);
		return await queryGetList.getManyAndCount();
	}

	private createQueryGetList(data: QueryGetListPermissionDto) {
		const {
			keyword,

			startCreatedAt,
			endCreatedAt,
			startUpdatedAt,
			endUpdatedAt,

			fieldOrder,
			orderBy,

			skip,
			pageSize,
		} = data;

		const query = this.permissionRepo.createQueryBuilder('permission');

		if (keyword) {
			query.andWhere('permission.name ILIKE :keyword', {
				keyword: `%${keyword}%`,
			});
		}

		if (startCreatedAt && endCreatedAt) {
			query.andWhere(
				`permission.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			query.andWhere(
				`permission.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		query.orderBy(`permission.${fieldOrder}`, orderBy);
		query.skip(skip).take(pageSize);

		return query;
	}

	// validate
	async validate({ name, value }: { name?: string; value?: string }) {
		if (name) {
			const entity = await this.permissionRepo.findOne({
				where: { name },
			});

			if (entity) {
				throw new ResponseError({
					messageCode:
						PermissionMessageCodeError.DUPLICATE_NAME_PERMISSION,
					message: PermissionMessageError.DUPLICATE_NAME_PERMISSION,
					messageWarning:
						PermissionMessageError.DUPLICATE_NAME_PERMISSION +
						': ' +
						name,
				});
			}
		}

		if (value) {
			const entity = await this.permissionRepo.findOne({
				where: { value },
			});

			if (entity) {
				throw new ResponseError({
					messageCode:
						PermissionMessageCodeError.DUPLICATE_VALUE_PERMISSION,
					message: PermissionMessageError.DUPLICATE_VALUE_PERMISSION,
					messageWarning:
						PermissionMessageError.DUPLICATE_VALUE_PERMISSION +
						': ' +
						value,
				});
			}
		}
	}
}
