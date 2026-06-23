import {
	ConflictException,
	forwardRef,
	Inject,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import differenceBy from 'lodash/differenceBy';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { buildTree, TreeNode } from 'src/utils/util.build-tree';
import { Brackets, FindOneOptions, In, TreeRepository } from 'typeorm';
import { AccessControlService } from '../access-control/access-control.service';
import { AuthMessages } from '../auth/constants/messages';
import { TenantUserType } from '../user/enum/user.enum';
import { TenantUserService } from '../user/services/tenant-user.service';
import {
	checkIsNotSystemAdmin,
	checkIsNotSystemTenant,
} from '../user/utils/user-type.util';
import {
	CreateTenantDto,
	FindTenantsDto,
	UpdateTenantDto,
} from './dtos/tenant.dto';
import { TenantMessages } from './tenant.constant';
import { Tenant } from './tenant.entity';
import { TenantType } from './tenant.enum';
import { parentFirstSort } from './tenant.util';

@Injectable()
export class TenantService {
	constructor(
		@InjectRepository(Tenant)
		private readonly tenantTreeRepo: TreeRepository<Tenant>,
		@Inject(forwardRef(() => TenantUserService))
		private readonly tenantUserService: TenantUserService,
		@Inject(forwardRef(() => AccessControlService))
		private readonly accessControlService: AccessControlService,
	) {}

	checkCanAccess(tenantUserId: string, tenantId: string, parentId?: string) {
		if (checkIsNotSystemTenant(tenantUserId)) {
			if (tenantId !== tenantUserId && parentId !== tenantUserId) {
				throw new ResponseError(AuthMessages.FORBIDDEN);
			}
		}
	}

	async getDescendantIds(tenantId: string): Promise<string[]> {
		const tenant = await this.tenantTreeRepo.findOne({
			where: { id: tenantId },
		});

		if (!tenant) {
			throw new ResponseError({
				...TenantMessages.NOT_FOUND,
				data: tenantId,
			});
		}

		// Closure tree tra ve ca node goc, nen ket qua bao gom tenant hien tai
		// cung tat ca con/chau theo de quy.
		const descendants = await this.tenantTreeRepo.findDescendants(tenant);
		return descendants.map((item) => item.id);
	}

	async findAll(
		query: FindTenantsDto,
		tenantId: string,
	): Promise<PageDto<TreeNode<Tenant, 'children'>>> {
		// Whitelist sortable fields
		const orderable: Record<string, string> = {
			id: 't.id',
			name: 't.name',
			createdAt: 't.created_at',
			updatedAt: 't.updated_at',
			// add more as needed
		};
		const orderCol = orderable[query.fieldOrder] ?? 't.name';
		const orderDir =
			(query.orderBy ?? 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

		// 1) Fetch the root tenant and its direct children (no keyword/type filtering here),
		//    attach tenantUserCount via loadRelationCountAndMap, avoid row duplication.
		const queryBuilder = this.tenantTreeRepo
			.createQueryBuilder('t')
			.leftJoinAndSelect('t.parent', 'p')
			// Ensure OWNER exists without joining tenantUser (prevents row explosion)
			.andWhere(
				`EXISTS (
					SELECT 1 FROM tenant_user tu
					WHERE tu.tenant_id = t.id AND tu.type = :owner
				)`,
				{ owner: TenantUserType.OWNER },
			)
			// Count ALL tenant users per tenant:
			.loadRelationCountAndMap('t.tenantUserCount', 't.tenantUser')
			.orderBy(orderCol, orderDir)
			.select([
				't.id',
				't.name',
				't.title',
				't.logo',
				't.icon',
				't.type',
				'p.id',
			]);

		if (checkIsNotSystemTenant(tenantId)) {
			queryBuilder.andWhere(
				new Brackets((w) =>
					w
						.where('t.id = :tid', { tid: tenantId })
						.orWhere('p.id = :tid', { tid: tenantId }),
				),
			);
		}

		// Filter by isActive at SQL level
		if (query.isActive !== undefined) {
			queryBuilder.andWhere('t.is_active = :isActive', {
				isActive: query.isActive,
			});
		}

		const baseTenants = await queryBuilder.getMany();

		if (!baseTenants.length) {
			return new PageDto({
				items: [],
				metadata: { page: 1, pageSize: 0, totalItems: 0 },
			});
		}

		// 2) Second pass to get tenantUser -> user details (keeps main query lean)
		const ids = baseTenants.map((t) => t.id);
		const enriched = await this.tenantTreeRepo.find({
			where: { id: In(ids) },
			relations: {
				parent: true,
				tenantUser: { user: true },
			},
			select: {
				id: true,
				logo: true,
				icon: true,
				title: true,
				name: true,
				email: true,
				isActive: true,
				type: true,
				maxLabels: true,
				code: true,
				parent: {
					id: true,
					logo: true,
					icon: true,
					title: true,
					name: true,
					email: true,
					isActive: true,
					type: true,
					maxLabels: true,
					code: true,
				},
				tenantUser: {
					id: true,
					type: true,
					user: { id: true, name: true, email: true },
				},
			},
			order: {
				name: 'ASC',
			},
		});

		// 2.1) Re-attach counts onto enriched entities
		const countMap = new Map(
			baseTenants.map((t) => [
				t.id,
				(t as any).tenantUserCount as number,
			]),
		);

		for (const t of enriched) {
			(t as any).tenantUserCount = countMap.get(t.id) ?? 0;
		}

		// 3) In-memory filter to keep semantics and still include ancestors later
		const { keyword, type, isActive } = query;

		// 3.1) If isActive filter is true, exclude children whose parent is inactive
		let filteredByParentActive = enriched;
		if (isActive === true) {
			const idToTenant = new Map<string, Tenant>(
				enriched.map((t) => [t.id, t]),
			);

			// Check if any ancestor is inactive
			const hasInactiveAncestor = (tenant: Tenant): boolean => {
				let current = tenant.parent;
				while (current) {
					const parentTenant = idToTenant.get(current.id);
					if (parentTenant && !parentTenant.isActive) {
						return true;
					}
					current = parentTenant?.parent ?? null;
				}
				return false;
			};

			filteredByParentActive = enriched.filter(
				(t) => !hasInactiveAncestor(t),
			);
		}

		const matched = filteredByParentActive.filter((cat) => {
			if (
				keyword &&
				!cat.name.toLowerCase().includes(keyword.toLowerCase())
			)
				return false;
			if (type?.length && !type.includes(cat.type as any)) return false;
			return true;
		});

		// 4) Collect ancestors of matched nodes (from the already-loaded set)
		const idToCat = new Map<string, Tenant>(
			filteredByParentActive.map((c) => [c.id, c]),
		);
		const ancestorIds = new Set<string>();
		for (const node of matched) {
			let p = node.parent;
			while (p) {
				if (ancestorIds.has(p.id)) break;
				ancestorIds.add(p.id);
				p = idToCat.get(p.id)?.parent ?? null;
			}
		}

		// 5) Keep matched + ancestors
		const allowedIds = new Set<string>([
			...matched.map((c) => c.id),
			...ancestorIds,
		]);
		const allowedNodes = enriched.filter((c) => allowedIds.has(c.id));

		// 6) Build tree
		const trees = buildTree(allowedNodes, {
			idKey: 'id',
			parentKey: 'parent',
			childrenKey: 'children',
		});

		// 7) Return
		return new PageDto({
			items: trees,
			metadata: {
				page: 1,
				pageSize: trees.length,
				totalItems: trees.length,
			},
		});
	}

	async getListSimple() {
		return this.tenantTreeRepo.find({
			select: ['id', 'logo', 'icon', 'title', 'name', 'primaryColor'],
			where: {
				isActive: true,
			},

			order: { name: 'ASC' },
		});
	}

	async findAllFlattenActive(req: Request): Promise<PageDto<Tenant>> {
		const queryBuilder = this.tenantTreeRepo
			.createQueryBuilder('tenant')
			.select([
				'tenant.id',
				'tenant.name',
				'tenant.title',
				'tenant.logo',
				'tenant.icon',
				'tenant.type',
				'user.id',
				'user.name',
				'user.email',
				'parent.id',
				'parent.name',
				'tenantUser.id',
				'tenantUser.type',
				'user.id',
				'user.name',
				'user.email',
			])
			.leftJoin('tenant.tenantUser', 'tenantUser')
			.leftJoin('tenantUser.user', 'user')
			.leftJoin('tenant.parent', 'parent')
			.where('tenant.isActive = :isActive', { isActive: true })
			.andWhere('tenantUser.type = :type', {
				type: TenantUserType.OWNER,
			})
			.orderBy('tenant.name', 'ASC');

		const tenantId = req.user!.tenantId;
		const userType = req.user!.type;
		if (checkIsNotSystemAdmin(userType)) {
			queryBuilder.andWhere(
				new Brackets((qb) => {
					qb.andWhere('tenant.id = :tenantId', { tenantId }).orWhere(
						'parent.id = :tenantId',
						{ tenantId },
					);
				}),
			);
		}

		const data = await queryBuilder.getMany();
		const sorted = parentFirstSort(data);

		return new PageDto({
			items: sorted,
			metadata: {
				page: 1,
				pageSize: sorted.length,
				totalItems: sorted.length,
			},
		});
	}

	/** Lấy một node cùng toàn bộ descendants */
	async findOne(id: string, tenantId: string): Promise<Tenant> {
		const node = await this.tenantTreeRepo.findOne({
			where: { id },
			relations: {
				parent: true,
				tenantUser: {
					user: true,
				},
			},
			select: {
				tenantUser: {
					id: true,
					type: true,
					user: {
						id: true,
						name: true,
						email: true,
					},
				},
			},
		});

		if (!node) {
			throw new ResponseError({
				...TenantMessages.NOT_FOUND,
				data: id,
			});
		}

		this.checkCanAccess(tenantId, node.id, node.parent?.id);

		const tree = await this.tenantTreeRepo.findDescendantsTree(node, {
			relations: ['parent', 'tenantUser'],
		});
		return tree;
	}

	/** Tạo mới, gán parent nếu có và tự động lưu closure-table */
	async create(
		{ ownerId, ...dto }: CreateTenantDto,
		tenantId: string,
		userReqId: string,
	): Promise<Tenant> {
		// Check duplicate name
		const dup = await this.tenantTreeRepo.findOne({
			where: { name: dto.name },
		});
		if (dup) {
			throw new ConflictException(`Tenant '${dto.name}' already exists`);
		}

		// Check parent's type if parent exists. Only type label can have parent
		let parent: Tenant | undefined;
		if (dto.parentId && dto.type === TenantType.LABEL) {
			const foundParent = await this.tenantTreeRepo.findOne({
				where: { id: dto.parentId },
			});
			if (!foundParent) {
				throw new ResponseError({
					...TenantMessages.NOT_FOUND,
					data: dto.parentId,
				});
			}
			// if (foundParent.type !== dto.type) {
			// 	throw new BadRequestException(
			// 		`Tenant's type must match parent's type. Parent has ${foundParent.type} but trying to set ${dto.type}`,
			// 	);
			// }
			parent = foundParent;
		}

		const tenant = this.tenantTreeRepo.create({
			...dto,
			creatorId: userReqId,
			modifierId: userReqId,
		});

		if (parent) {
			tenant.parent = parent;
		}

		const saved = await this.tenantTreeRepo.save(tenant);

		// Create owner
		await this.tenantUserService.addUserToTenant(
			saved.id,
			ownerId,
			TenantUserType.OWNER,
			userReqId,
		);

		return this.findOne(saved.id, tenantId);
	}

	/** Cập nhật thông tin và parent */
	async update(
		id: string,
		dto: UpdateTenantDto,
		tenantId: string,
		userReqId: string,
	): Promise<Tenant> {
		const tenant = await this.tenantTreeRepo.findOne({
			where: { id },
			relations: {
				parent: true,
			},
		});
		if (!tenant) {
			throw new ResponseError({
				...TenantMessages.NOT_FOUND,
				data: id,
			});
		}

		this.checkCanAccess(tenantId, tenant.id, tenant.parent?.id);

		// Đổi tên nếu cần và check duplicate
		if (dto.name && dto.name !== tenant.name) {
			const dup = await this.tenantTreeRepo.findOne({
				where: { name: dto.name },
			});
			if (dup) {
				throw new ConflictException(
					`Tenant '${dto.name}' already exists`,
				);
			}
			tenant.name = dto.name;
		}

		// Parent: null → gỡ, id → set, undefined → giữ nguyên
		if (dto.type === TenantType.WHITE_LABEL) {
			tenant.parent = null;
		} else if (dto.parentId !== undefined) {
			if (dto.parentId === null) {
				tenant.parent = null;
			} else {
				const parent = await this.tenantTreeRepo.findOne({
					where: { id: dto.parentId },
				});
				if (!parent) {
					throw new NotFoundException(
						`Parent tenant ${dto.parentId} not found`,
					);
				}
				tenant.parent = parent;
			}
		}

		// Cập nhật các thuộc tính khác
		const { name: _name, parentId: _parentId, ...rest } = dto;
		Object.entries(rest).forEach(([key, val]) => {
			if (val !== undefined) {
				(tenant as any)[key] = val;
			}
		});

		await this.tenantTreeRepo.save({ ...tenant, modifierId: userReqId });

		// Nếu khoá tenant cha thì sẽ khoá tất cả tenant con
		if (dto.isActive === false) {
			const childIds = await this.getDescendantIds(id);

			await this.tenantTreeRepo.update(
				{ parent: { id } },
				{ isActive: dto.isActive, modifierId: userReqId },
			);

			// Invalidate auth contexts for all descendant tenants
			for (const childId of childIds) {
				await this.accessControlService.invalidateAuthContext(
					undefined,
					childId,
				);
			}
		}

		// Invalidate all auth contexts for users in this tenant
		await this.accessControlService.invalidateAuthContext(undefined, id);

		return this.findOne(id, tenantId);
	}

	async validateExisted(id: string | string[]) {
		if (Array.isArray(id)) {
			const list = await this.tenantTreeRepo.find({
				where: {
					id: In(id),
				},
				select: ['id'],
			});
			if (list.length !== id.length) {
				const diffIds = differenceBy(
					id,
					list.map((item) => item.id),
				);
				throw new ResponseError({
					...TenantMessages.NOT_FOUND,
					data: diffIds,
				});
			}
		} else {
			const data = await this.tenantTreeRepo.findOne({
				where: {
					id,
				},
				select: ['id'],
			});
			if (!data) {
				throw new ResponseError(TenantMessages.NOT_FOUND);
			}
		}
	}

	async getTenantType(id: string) {
		const data = await this.tenantTreeRepo.findOne({
			where: { id },
			select: { type: true },
		});

		if (!data) {
			throw new ResponseError({
				...TenantMessages.NOT_FOUND,
				data: id,
			});
		}

		return data.type;
	}

	async getOneTenantData(id: string, options?: FindOneOptions<Tenant>) {
		const data = await this.tenantTreeRepo.findOne({
			...options,
			where: { ...options?.where, id },
		});

		if (!data) {
			throw new ResponseError({
				...TenantMessages.NOT_FOUND,
				data: id,
			});
		}

		return data;
	}

	checkActive(isActive: boolean) {
		if (!isActive) throw new ResponseError(TenantMessages.BLOCKED);
	}
}
