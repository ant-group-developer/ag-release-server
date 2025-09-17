import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';

import { IssueLevelMessage } from '../constant/issue-level.constant';
import { QueryGetListIssueLevelDto } from '../dto/issue-level.dto';
import { IssueLevel } from '../entities/issue-level.entity';

@Injectable()
export class IssueLevelQueryService {
	constructor(
		@InjectRepository(IssueLevel)
		private readonly issueLevelRepo: Repository<IssueLevel>,
	) {}

	private createQueryGetList(query: QueryGetListIssueLevelDto) {
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
		} = query;

		const queryBuilder =
			this.issueLevelRepo.createQueryBuilder('issueLevel');

		if (keyword) {
			queryBuilder.andWhere(
				'(issueLevel.nameVi ILIKE :keyword OR issueLevel.nameEn ILIKE :keyword)',
				{ keyword: `%${keyword}%` },
			);
		}

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`issueLevel.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{ startCreatedAt, endCreatedAt },
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`issueLevel.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{ startUpdatedAt, endUpdatedAt },
			);
		}

		queryBuilder.orderBy(`issueLevel.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

	async getList(query: QueryGetListIssueLevelDto) {
		const queryGetList = this.createQueryGetList(query);
		return await queryGetList.getManyAndCount();
	}

	// validate
	async validate({
		nameVi,
		nameEn,
		code,
	}: {
		nameVi?: string;
		nameEn?: string;
		code?: string;
	}) {
		if (nameVi) {
			const existingNameVi = await this.issueLevelRepo.findOne({
				where: { nameVi },
			});
			if (existingNameVi) {
				throw new ResponseError(IssueLevelMessage.DUPLICATE_NAME_VI);
			}
		}

		if (nameEn) {
			const existingNameEn = await this.issueLevelRepo.findOne({
				where: { nameEn },
			});
			if (existingNameEn) {
				throw new ResponseError(IssueLevelMessage.DUPLICATE_NAME_EN);
			}
		}

		if (code) {
			const existingCode = await this.issueLevelRepo.findOne({
				where: { code },
			});
			if (existingCode) {
				throw new ResponseError(IssueLevelMessage.DUPLICATE_CODE);
			}
		}
	}

	async findOneWithCountRelation(id: string) {
		const query = this.issueLevelRepo.createQueryBuilder('issueLevel');

		// virtual count issues
		query.addSelect((subQuery) => {
			return subQuery
				.select('COUNT(issue.id)')
				.from('issues', 'issue')
				.where('issue.issue_level_id = issueLevel.id');
		}, 'issues_count');

		query.where('issueLevel.id = :id', { id });

		const dataFromDb: {
			raw: { issuelevel_id: string; issues_count: string }[];
			entities: IssueLevel[];
		} = await query.getRawAndEntities();

		const items = this.assigneeVirtualColumn(dataFromDb);
		return items[0];
	}

	private assigneeVirtualColumn(dataFromDb: {
		raw: { issuelevel_id: string; issues_count: string }[];
		entities: IssueLevel[];
	}) {
		return dataFromDb.entities.map((entity) => {
			const dataRaw = dataFromDb.raw.find(
				(item) => item.issuelevel_id === entity.id,
			);

			entity.issuesCount = Number(dataRaw?.issues_count ?? 0);
			return entity;
		});
	}

	validateDelete(issueLevel: IssueLevel) {
		if ((issueLevel.issuesCount ?? 0) > 0) {
			throw new ResponseError({
				...IssueLevelMessage.CANNOT_DELETE_BECAUSE_LINKED_ISSUES,
				messageWarning: `${IssueLevelMessage.CANNOT_DELETE_BECAUSE_LINKED_ISSUES.message}: ${issueLevel.id}`,
			});
		}
	}
}
