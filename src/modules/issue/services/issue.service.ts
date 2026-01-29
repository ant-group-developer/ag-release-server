import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';

import { IssueResponse } from '../constants/issue.constant';
import {
	CreateIssueDto,
	QueryGetListIssueDto,
	UpdateIssueDto,
} from '../dto/issue.dto';
import { Issue } from '../entities/issue.entity';
import { IssueQueryService } from './issue.query.service';

@Injectable()
export class IssueService {
	constructor(
		@InjectRepository(Issue)
		private readonly issueRepo: Repository<Issue>,
		private readonly issueQueryService: IssueQueryService,
	) {}

	async create(data: CreateIssueDto, userId: string) {
		const { nameVi, nameEn, code, issueLevelId } = data;
		await this.issueQueryService.validate({
			nameVi,
			nameEn,
			code,
			issueLevelId,
		});

		const entity = this.issueRepo.create({
			...data,
			creatorId: userId,
			modifierId: userId,
		});
		return this.issueRepo.save(entity);
	}

	async findOne(id: string): Promise<Issue> {
		const entity = await this.issueRepo.findOne({ where: { id } });
		if (!entity) throw new ResponseError(IssueResponse.NOT_FOUND);
		return entity;
	}

	async findOneSimple(id: string): Promise<Issue> {
		const entity = await this.issueRepo.findOne({
			where: { id },
			select: ['id', 'score', 'numberOfDaysAffect'],
		});
		if (!entity) throw new ResponseError(IssueResponse.NOT_FOUND);
		return entity;
	}

	async getList(query: QueryGetListIssueDto): Promise<PageDto<Issue>> {
		const { page, pageSize } = query;
		const [items, totalItems] = await this.issueQueryService.getList(query);
		return new PageDto({
			items,
			metadata: { page: page, pageSize, totalItems },
		});
	}

	async getListSimple() {
		return this.issueQueryService.getListSimple();
	}

	async update(id: string, data: UpdateIssueDto, userId: string) {
		const { nameVi, nameEn, code, issueLevelId } = data;

		const entity = await this.findOne(id);

		if (nameVi && nameVi !== entity.nameVi)
			await this.issueQueryService.validate({ nameVi });
		if (nameEn && nameEn !== entity.nameEn)
			await this.issueQueryService.validate({ nameEn });
		if (code && code !== entity.code)
			await this.issueQueryService.validate({ code });
		if (issueLevelId && issueLevelId !== entity.issueLevelId)
			await this.issueQueryService.validate({ issueLevelId });

		await this.issueRepo.update(id, { ...data, modifierId: userId });
		return this.findOne(id);
	}

	async delete(id: string): Promise<void> {
		const entity = await this.findOne(id);
		await this.issueRepo.delete(entity.id);
	}
}
