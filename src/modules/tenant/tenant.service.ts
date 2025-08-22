import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { buildTree, TreeNode } from 'src/utils/util.build-tree';
import { Brackets, In, TreeRepository } from 'typeorm';
import { TenantUserType } from '../user/enum/user.enum';
import { TenantUserService } from '../user/services/tenant-user.service';
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
		private readonly tenantUserService: TenantUserService,
	) {}

	async findAll(
		query: FindTenantsDto,
		req: Request,
	): Promise<PageDto<TreeNode<Tenant, 'children'>>> {
		const tenantId = req.user?.tenantId;
		if (!tenantId) throw new BadRequestException('Missing tenantId');

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
		const baseTenants = await this.tenantTreeRepo
			.createQueryBuilder('t')
			.leftJoinAndSelect('t.parent', 'p')
			.where(
				new Brackets((w) =>
					w
						.where('t.id = :tid', { tid: tenantId })
						.orWhere('p.id = :tid', { tid: tenantId }),
				),
			)
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
			])
			.getMany();

		if (!baseTenants.length) {
			return new PageDto({
				items: [],
				metadata: { currentPage: 1, pageSize: 0, totalItems: 0 },
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
				parent: {
					id: true,
					logo: true,
					icon: true,
					title: true,
					name: true,
					email: true,
					isActive: true,
					type: true,
				},
				tenantUser: {
					id: true,
					type: true,
					user: { id: true, name: true, email: true },
				},
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
		const { keyword, type } = query;
		const matched = enriched.filter((cat) => {
			if (
				keyword &&
				!cat.name.toLowerCase().includes(keyword.toLowerCase())
			)
				return false;
			if (type?.length && !type.includes(cat.type as any)) return false;
			return true;
		});

		// 4) Collect ancestors of matched nodes (from the already-loaded set)
		const idToCat = new Map<string, Tenant>(enriched.map((c) => [c.id, c]));
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
				currentPage: 1,
				pageSize: trees.length,
				totalItems: trees.length,
			},
		});
	}

	async findAllFlattenActive(): Promise<PageDto<Tenant>> {
		const data = await this.tenantTreeRepo
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
			.orderBy('tenant.name', 'ASC')
			.getMany();

		const sorted = parentFirstSort(data);

		return new PageDto({
			items: sorted,
			metadata: {
				currentPage: 1,
				pageSize: sorted.length,
				totalItems: sorted.length,
			},
		});
	}

	/** Lấy một node cùng toàn bộ descendants */
	async findOne(id: string): Promise<Tenant> {
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
			throw new NotFoundException(`Tenant with ID ${id} not found`);
		}
		const tree = await this.tenantTreeRepo.findDescendantsTree(node, {
			relations: ['parent', 'tenantUser'],
		});
		return tree;
	}

	/** Tạo mới, gán parent nếu có và tự động lưu closure-table */
	async create({ ownerId, ...dto }: CreateTenantDto): Promise<Tenant> {
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
				throw new NotFoundException(
					`Parent tenant ${dto.parentId} not found`,
				);
			}
			// if (foundParent.type !== dto.type) {
			// 	throw new BadRequestException(
			// 		`Tenant's type must match parent's type. Parent has ${foundParent.type} but trying to set ${dto.type}`,
			// 	);
			// }
			parent = foundParent;
		}

		const tenant = this.tenantTreeRepo.create(dto);

		if (parent) {
			tenant.parent = parent;
		}

		const saved = await this.tenantTreeRepo.save(tenant);

		// Create owner
		await this.tenantUserService.addUserToTenant(
			saved.id,
			ownerId,
			TenantUserType.OWNER,
		);

		return this.findOne(saved.id);
	}

	/** Cập nhật thông tin và parent */
	async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
		const tenant = await this.tenantTreeRepo.findOne({
			where: { id },
		});
		if (!tenant) {
			throw new NotFoundException(`Tenant with ID ${id} not found`);
		}

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

		await this.tenantTreeRepo.save(tenant);
		return this.findOne(id);
	}

	async validateExisted(id: string) {
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
