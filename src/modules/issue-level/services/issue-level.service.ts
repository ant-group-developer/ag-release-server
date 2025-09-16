import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';

import { IssueLevelMessage } from '../constant/issue-level.constant';
import {
	BulkUpdateIssueLevel,
	CreateIssueLevelDto,
	QueryGetListIssueLevelDto,
	UpdateIssueLevelDto,
} from '../dto/issue-level.dto';
import { IssueLevel } from '../entities/issue-level.entity';
import { IssueLevelQueryService } from './issue-level.query.service';

@Injectable()
export class IssueLevelService {
	constructor(
		@InjectRepository(IssueLevel)
		private readonly issueLevelRepo: Repository<IssueLevel>,
		private readonly issueLevelQueryService: IssueLevelQueryService,
	) {}

	async create(
		data: CreateIssueLevelDto,
		userId: string,
	): Promise<IssueLevel> {
		const { nameVi, nameEn, code } = data;

		await this.issueLevelQueryService.validate({ nameVi, nameEn, code });
		const issueLevel = this.issueLevelRepo.create({
			...data,
			creatorId: userId,
			modifierId: userId,
		});
		return await this.issueLevelRepo.save(issueLevel);
	}

	async findOne(id: string): Promise<IssueLevel> {
		const issueLevel = await this.issueLevelRepo.findOne({ where: { id } });
		if (!issueLevel) {
			throw new ResponseError(IssueLevelMessage.NOT_FOUND);
		}
		return issueLevel;
	}

	async findOneWithCountRelation(id: string) {
		const issueLevel =
			await this.issueLevelQueryService.findOneWithCountRelation(id);

		if (!issueLevel) {
			throw new ResponseError(IssueLevelMessage.NOT_FOUND);
		}

		return issueLevel;
	}

	async getList(
		query: QueryGetListIssueLevelDto,
	): Promise<PageDto<IssueLevel>> {
		const { page, pageSize } = query;
		const [items, totalItems] =
			await this.issueLevelQueryService.getList(query);

		return new PageDto({
			items,
			metadata: { currentPage: page, pageSize, totalItems },
		});
	}

	async getListSimple() {
		return this.issueLevelRepo.find({
			select: ['id', 'code', 'nameVi', 'nameEn', 'color'],
			order: {
				severityRank: 'ASC',
			},
		});
	}

	async bulkUpdate(data: BulkUpdateIssueLevel): Promise<IssueLevel[]> {
		const { issueLevels } = data;
		await Promise.all(issueLevels.map((item) => this.findOne(item.id)));
		return await this.issueLevelRepo.save(issueLevels);
	}

	async update(
		id: string,
		data: UpdateIssueLevelDto,
		userId: string,
	): Promise<IssueLevel> {
		const { nameVi, nameEn, code } = data;
		const issueLevel = await this.findOne(id);

		if (nameVi && nameVi !== issueLevel.nameVi) {
			await this.issueLevelQueryService.validate({ nameVi });
		}
		if (nameEn && nameEn !== issueLevel.nameEn) {
			await this.issueLevelQueryService.validate({ nameEn });
		}
		if (code && code !== issueLevel.code) {
			await this.issueLevelQueryService.validate({ code });
		}

		await this.issueLevelRepo.update(id, { ...data, modifierId: userId });
		return this.findOne(id);
	}

	async delete(id: string): Promise<void> {
		const issueLevel = await this.findOneWithCountRelation(id);
		this.issueLevelQueryService.validateDelete(issueLevel);
		await this.issueLevelRepo.delete(id);
	}
}
