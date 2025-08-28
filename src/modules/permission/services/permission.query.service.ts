import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { PermissionMessage } from '../constants/permission.constant';
import { QueryGetListPermissionDto } from '../dto/permission.dto';
import { Permission } from '../entities/permission.entity';

@Injectable()
export class PermissionQueryService {
	constructor(
		@InjectRepository(Permission)
		private readonly permissionRepo: Repository<Permission>,
	) {}

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
					...PermissionMessage.DUPLICATE_NAME_PERMISSION,
					messageWarning:
						PermissionMessage.DUPLICATE_NAME_PERMISSION.message +
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
					...PermissionMessage.DUPLICATE_CODE_PERMISSION,
					messageWarning:
						PermissionMessage.DUPLICATE_CODE_PERMISSION.message +
						': ' +
						code,
				});
			}
		}
	}

	validateDelete(permission: Permission) {
		if ((permission.userCount ?? 0) > 0) {
			throw new ResponseError({
				...PermissionMessage.CANNOT_DELETE_BECAUSE_LINKED_USERS,
				messageWarning:
					PermissionMessage.CANNOT_DELETE_BECAUSE_LINKED_USERS
						.message +
					': ' +
					permission.id,
			});
		}

		if ((permission.rolePermissionCount ?? 0) > 0) {
			throw new ResponseError({
				...PermissionMessage.CANNOT_DELETE_BECAUSE_LINKED_ROLE_PERMISSIONS,
				messageWarning:
					PermissionMessage
						.CANNOT_DELETE_BECAUSE_LINKED_ROLE_PERMISSIONS.message +
					': ' +
					permission.id,
			});
		}
	}
}
