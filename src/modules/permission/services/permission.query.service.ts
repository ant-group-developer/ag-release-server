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
	async validate({ name, code }: { name?: string; code?: string }) {
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

		if (code) {
			const entity = await this.permissionRepo.findOne({
				where: { code },
			});

			if (entity) {
				throw new ResponseError({
					messageCode:
						PermissionMessageCodeError.DUPLICATE_CODE_PERMISSION,
					message: PermissionMessageError.DUPLICATE_CODE_PERMISSION,
					messageWarning:
						PermissionMessageError.DUPLICATE_CODE_PERMISSION +
						': ' +
						code,
				});
			}
		}
	}

	validateDelete(permission: Permission) {
		if ((permission.userCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					PermissionMessageError.CANNOT_DELETE_BECAUSE_LINKED_USERS,
				messageCode:
					PermissionMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_USERS,
				messageWarning:
					PermissionMessageError.CANNOT_DELETE_BECAUSE_LINKED_USERS +
					': ' +
					permission.id,
				statusCode: 400,
			});
		}

		if ((permission.rolePermissionCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					PermissionMessageError.CANNOT_DELETE_BECAUSE_LINKED_ROLE_PERMISSIONS,
				messageCode:
					PermissionMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_ROLE_PERMISSIONS,
				messageWarning:
					PermissionMessageError.CANNOT_DELETE_BECAUSE_LINKED_ROLE_PERMISSIONS +
					': ' +
					permission.id,
				statusCode: 400,
			});
		}
	}
}
