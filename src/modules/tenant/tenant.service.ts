import {
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/response.dto';
import { buildTree, TreeNode } from 'src/utils/util.build-tree';
import { TreeRepository } from 'typeorm';
import { UserService } from '../user/services/user.service';
import {
	CreateTenantDto,
	FindTenantsDto,
	UpdateTenantDto,
} from './dtos/tenant.dto';
import { Tenant } from './tenant.entity';

@Injectable()
export class TenantService {
	constructor(
		@InjectRepository(Tenant)
		private readonly tenantTreeRepo: TreeRepository<Tenant>,
		private readonly userService: UserService,
	) {}

	async findAll(
		query: FindTenantsDto,
	): Promise<PageDto<TreeNode<Tenant, 'children'>>> {
		// 1. Xây điều kiện filter từ DTO
		const { keyword, type } = query;

		// 2. Lấy toàn bộ categories flat kèm relation parent
		const allTenants = await this.tenantTreeRepo.find({
			relations: ['parent', 'owner'],
			order: {
				[query.fieldOrder]: query.orderBy,
			},
		});

		// 3. Tách ra những node THOẢ điều kiện filter
		const matched = allTenants.filter((cat) => {
			if (
				keyword &&
				!cat.name.toLowerCase().includes(keyword.toLowerCase())
			) {
				return false;
			}
			if (type?.length && !type.includes(cat.type)) {
				return false;
			}
			return true;
		});

		// 4. Thu thập tất cả ancestor của mỗi matched node
		const idToCat = new Map<string, Tenant>(
			allTenants.map((c) => [c.id, c]),
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

		// 5. Xác định tập các node được giữ lại (matched + ancestors)
		const allowedIds = new Set<string>([
			...matched.map((c) => c.id),
			...ancestorIds,
		]);
		const allowedNodes = allTenants.filter((c) => allowedIds.has(c.id));

		// 6. Build tree
		const trees = buildTree(allowedNodes, {
			idKey: 'id',
			parentKey: 'parent',
			childrenKey: 'children',
		});

		// 7. Trả về kèm metadata
		return new PageDto({
			items: trees,
			metadata: {
				currentPage: 1,
				pageSize: trees.length,
				totalItems: trees.length,
			},
		});
	}

	/** Lấy một node cùng toàn bộ descendants */
	async findOne(id: string): Promise<Tenant> {
		const node = await this.tenantTreeRepo.findOne({
			where: { id },
			relations: ['parent', 'owner'],
		});
		if (!node) {
			throw new NotFoundException(`Tenant with ID ${id} not found`);
		}
		const tree = await this.tenantTreeRepo.findDescendantsTree(node, {
			relations: ['parent', 'owner'],
		});
		return tree;
	}

	/** Tạo mới, gán parent nếu có và tự động lưu closure-table */
	async create(dto: CreateTenantDto): Promise<Tenant> {
		// Check duplicate name
		const dup = await this.tenantTreeRepo.findOne({
			where: { name: dto.name },
		});
		if (dup) {
			throw new ConflictException(`Tenant '${dto.name}' already exists`);
		}

		// Check parent's type if parent exists
		let parent: Tenant | undefined;
		if (dto.parentId) {
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
		if (dto.parentId !== undefined) {
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
}
