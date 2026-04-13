// src/modules/file-node/services/file-node.service.ts
// BỎ TRANSACTION + FIX updatedBy/createdBy + FIX import GetListFileNodesDto + FIX dto import path
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { FileNodeException } from '../const/file-node.const';

import {
	CreateFileNodeDto,
	GetListFileNodesDto,
	MoveFileNodeDto,
	UpdateFileNodeDto,
} from '../dto/create-file-node.dto';
import { FileNode, FileNodeType } from '../entities/file-node.entity';
import { FileNodeQueryService } from './file-node.query.service';

export type FileNodeTree = FileNode & { children?: FileNodeTree[] };

@Injectable()
export class FileNodeService {
	constructor(
		@InjectRepository(FileNode)
		private readonly repo: Repository<FileNode>,
		private readonly queryService: FileNodeQueryService,
	) {}

	private async assertParent(parentId?: string | null) {
		if (parentId === undefined) return;
		if (parentId === null) return;

		const parent = await this.repo.findOne({
			where: { id: parentId },
			select: { id: true, type: true } as any,
		});
		if (!parent) throw FileNodeException.PARENT_NOT_FOUND();
		if (parent.type !== FileNodeType.FOLDER)
			throw FileNodeException.PARENT_MUST_BE_FOLDER();
	}

	private async validateUnique({
		name,
		parentId,
		exceptId,
	}: {
		name: string;
		parentId: string | null;
		exceptId?: string;
	}) {
		const where: any = {
			name,
			parentId: parentId === null ? IsNull() : parentId,
		};
		if (exceptId) where.id = Not(exceptId);

		const existed = await this.repo.findOne({
			where,
			select: { id: true } as any,
		});
		if (existed) throw FileNodeException.NAME_EXISTED();
	}

	private async assertNotMoveIntoSelfOrDescendant(
		id: string,
		newParentId: string | null,
	) {
		if (!newParentId) return;
		if (newParentId === id) throw FileNodeException.INVALID_MOVE();

		let current: string | null = newParentId;
		while (current) {
			if (current === id) throw FileNodeException.INVALID_MOVE();

			const p = await this.repo.findOne({
				where: { id: current },
				select: { id: true, parentId: true } as any,
			});
			if (!p) break;
			current = p.parentId ?? null;
		}
	}

	async create({
		data,
		userId,
	}: {
		data: CreateFileNodeDto;
		userId: string;
	}): Promise<FileNode> {
		await this.assertParent(data.parentId ?? null);
		await this.validateUnique({
			name: data.name,
			parentId: data.parentId ?? null,
		});

		const entity = this.repo.create({
			...data,
			parentId: data.parentId ?? null,
			size: data.type === FileNodeType.FILE ? (data.size ?? 0) : null,
		});

		return this.repo.save(entity);
	}

	async update({
		id,
		data,
		userId,
	}: {
		id: string;
		data: UpdateFileNodeDto;
		userId: string;
	}): Promise<FileNode> {
		const node = await this.repo.findOne({ where: { id } });
		if (!node) throw FileNodeException.NOT_FOUND();

		if (data.parentId !== undefined) {
			await this.assertParent(data.parentId ?? null);
			await this.assertNotMoveIntoSelfOrDescendant(
				id,
				data.parentId ?? null,
			);
		}

		const nextParentId =
			data.parentId !== undefined
				? (data.parentId ?? null)
				: node.parentId;

		const nextName = data.name ?? node.name;

		if (data.name !== undefined || data.parentId !== undefined) {
			await this.validateUnique({
				name: nextName,
				parentId: nextParentId,
				exceptId: id,
			});
		}

		const nextType = data.type ?? node.type;

		const patch: any = {
			...data,
			parentId:
				data.parentId !== undefined
					? (data.parentId ?? null)
					: node.parentId,
		};

		patch.updatedBy = userId;

		if (nextType === FileNodeType.FOLDER) {
			patch.size = null;
		} else {
			patch.size = data.size ?? node.size ?? 0;
		}

		await this.repo.update({ id } as any, patch);
		const updated = await this.repo.findOne({ where: { id } });
		if (!updated) throw FileNodeException.NOT_FOUND();
		return updated;
	}

	async delete({ id }: { id: string }) {
		const node = await this.repo.findOne({ where: { id } });
		if (!node) throw FileNodeException.NOT_FOUND();
		await this.repo.remove(node);
		return { id };
	}

	async getDetail({ id }: { id: string }) {
		const node = await this.repo.findOne({ where: { id } });
		if (!node) throw FileNodeException.NOT_FOUND();
		return node;
	}

	async getList(filter: GetListFileNodesDto) {
		return this.queryService.getList(filter);
	}

	async move({
		id,
		data,
		userId,
	}: {
		id: string;
		data: MoveFileNodeDto;
		userId: string;
	}) {
		return this.update({ id, data, userId });
	}

	async getTree(rootId?: string) {
		const nodes = await this.repo.find({
			select: [
				'id',
				'name',
				'type',
				'parentId',
				'size',
				'createdAt',
				'updatedAt',
			] as any,
			order: { createdAt: 'ASC' as any },
		});

		const byId = new Map<string, FileNodeTree>();
		for (const n of nodes) byId.set(n.id, { ...(n as any), children: [] });

		const roots: FileNodeTree[] = [];
		for (const n of byId.values()) {
			if (n.parentId) {
				const p = byId.get(n.parentId);
				if (p) p.children.push(n);
				else roots.push(n);
			} else roots.push(n);
		}

		if (!rootId) return roots;

		const root = byId.get(rootId);
		if (!root) throw FileNodeException.NOT_FOUND();
		return [root];
	}
}
