import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { Permission } from '../../permission/entities/permission.entity';
import {
	RoleMessageCodeError,
	RoleMessageError,
} from '../constants/role.constant';
import { GetListRole } from '../dtos/role.dto';
import { Role } from '../entities/role.entity';

@Injectable()
export class RoleQueryService {
	constructor(
		@InjectRepository(Role)
		private readonly roleRepo: Repository<Role>,

		@InjectRepository(Permission)
		private readonly permissionRepo: Repository<Permission>,
	) {}

	async getOne(id: string) {
		const queryGetOne = this.createQueryGetOne(id);

		return await queryGetOne.getOne();
	}

	private createQueryGetOne(id: string) {
		const query = this.roleRepo.createQueryBuilder('role');

		query
			.leftJoin('role.rolePermissions', 'rolePermission')
			.leftJoin('rolePermission.permission', 'permission');

		query.addSelect([
			'rolePermission.id',
			'rolePermission.permissionId',

			'permission.id',
			'permission.name',
			'permission.code',
		]);

		query.where('role.id = :id', { id });

		return query;
	}

	async getList(data: GetListRole) {
		const query = this.createQueryGetList(data);

		return query.getManyAndCount();
	}

	private createQueryGetList(data: GetListRole) {
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

		const query = this.roleRepo.createQueryBuilder('role');

		query
			.leftJoin('role.rolePermissions', 'rolePermission')
			.leftJoin('rolePermission.permission', 'permission');

		query.addSelect([
			'rolePermission.id',
			'rolePermission.permissionId',

			'permission.id',
			'permission.name',
			'permission.code',
		]);

		if (keyword) {
			query.andWhere('role.name ILIKE :keyword', {
				keyword: `%${keyword}%`,
			});
		}

		if (startCreatedAt && endCreatedAt) {
			query.andWhere(
				`role.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			query.andWhere(
				`role.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		query.orderBy(`role.${fieldOrder}`, orderBy);
		query.skip(skip).take(pageSize);

		return query;
	}

	async validate({
		permissionId,
		name,
	}: {
		permissionId?: string;
		name?: string;
	}) {
		if (name) {
			const entity = await this.roleRepo.findOne({ where: { name } });

			if (entity) {
				throw new ResponseError({
					messageCode: RoleMessageCodeError.DUPLICATE_NAME_ROLE,
					message: RoleMessageError.DUPLICATE_NAME_ROLE,
				});
			}
		}

		if (permissionId) {
			const entity = await this.permissionRepo.findOne({
				where: { id: permissionId },
			});

			if (!entity) {
				throw new ResponseError({
					messageCode: RoleMessageCodeError.PERMISSION_NOT_FOUND,
					message: RoleMessageError.PERMISSION_NOT_FOUND,
					messageWarning: `${RoleMessageError.PERMISSION_NOT_FOUND}: ${permissionId}`,
				});
			}
		}
	}
}
