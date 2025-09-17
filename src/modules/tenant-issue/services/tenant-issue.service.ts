import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { TenantIssueMessage } from '../constants/tenant-issue.constant';
import {
	CreateTenantIssueDto,
	QueryGetListTenantIssueDto,
	UpdateTenantIssueDto,
} from '../dto/tenant-issue.dto';
import { TenantIssue } from '../entities/tenant-issue.entity';
import { TenantIssueQueryService } from './tenant-issue.query.service';

@Injectable()
export class TenantIssueService {
	constructor(
		@InjectRepository(TenantIssue)
		private readonly tenantIssueRepo: Repository<TenantIssue>,

		private readonly tenantIssueQueryService: TenantIssueQueryService,
	) {}

	async create(data: CreateTenantIssueDto, userId: string) {
		const { tenantId, issueId } = data;
		await this.tenantIssueQueryService.validate({ tenantId, issueId });

		const entity = this.tenantIssueRepo.create({
			...data,
			creatorId: userId,
			modifierId: userId,
		});

		return this.tenantIssueRepo.save(entity);
	}

	async update(id: string, data: UpdateTenantIssueDto, userId: string) {
		const entity = await this.findOne(id);

		const { tenantId, issueId } = data;

		if (tenantId && tenantId !== entity.tenantId) {
			await this.tenantIssueQueryService.validate({ tenantId });
		}

		if (issueId && issueId !== entity.issueId) {
			await this.tenantIssueQueryService.validate({ issueId });
		}

		await this.tenantIssueRepo.update(id, {
			...data,
			modifierId: userId,
		});

		return this.findOne(id);
	}

	async findOne(id: string): Promise<TenantIssue> {
		const entity = await this.tenantIssueRepo.findOne({
			where: { id },
			relations: ['tenant', 'issue'],
		});
		if (!entity) throw new ResponseError(TenantIssueMessage.NOT_FOUND);
		return entity;
	}

	async getList(
		query: QueryGetListTenantIssueDto,
	): Promise<PageDto<TenantIssue>> {
		const { page, pageSize } = query;
		const [items, totalItems] =
			await this.tenantIssueQueryService.getList(query);
		return new PageDto({
			items,
			metadata: { currentPage: page, pageSize, totalItems },
		});
	}

	async delete(id: string) {
		const entity = await this.findOne(id);
		await this.tenantIssueRepo.delete(entity.id);
	}
}
