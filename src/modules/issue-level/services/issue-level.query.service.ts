import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { Repository, SelectQueryBuilder } from 'typeorm';

import { IssueLevelResponse } from '../constant/issue-level.constant';
import { QueryGetListIssueLevelDto } from '../dto/issue-level.dto';
import { IssueLevel } from '../entities/issue-level.entity';

@Injectable()
export class IssueLevelQueryService {
	constructor(
		@InjectRepository(IssueLevel)
		private readonly issueLevelRepo: Repository<IssueLevel>,
	) {}

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
				throw new ResponseError(IssueLevelResponse.DUPLICATE_NAME_VI);
			}
		}

		if (nameEn) {
			const existingNameEn = await this.issueLevelRepo.findOne({
				where: { nameEn },
			});
			if (existingNameEn) {
				throw new ResponseError(IssueLevelResponse.DUPLICATE_NAME_EN);
			}
		}

		if (code) {
			const existingCode = await this.issueLevelRepo.findOne({
				where: { code },
			});
			if (existingCode) {
				throw new ResponseError(IssueLevelResponse.DUPLICATE_CODE);
			}
		}
	}

	async findOneWithCountRelation(id: string) {
		const query = this.createBaseQuery();

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

	validateDelete(issueLevel: IssueLevel) {
		if ((issueLevel.issuesCount ?? 0) > 0) {
			throw new ResponseError(
				IssueLevelResponse.CANNOT_DELETE_BECAUSE_LINKED_ISSUES(
					issueLevel.id,
				),
			);
		}
	}

	// private
	private createBaseQuery() {
		return this.issueLevelRepo.createQueryBuilder('issueLevel');
	}

	private createQueryGetList(filter: QueryGetListIssueLevelDto) {
		const qb = this.createBaseQuery();
		this.applyFilter({ qb, filter });

		return qb;
	}

	private applyFilter({
		filter,
		qb,
	}: {
		filter: QueryGetListIssueLevelDto;
		qb: SelectQueryBuilder<IssueLevel>;
	}) {
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
		} = filter;

		if (keyword) {
			qb.andWhere(
				'(issueLevel.nameVi ILIKE :keyword OR issueLevel.nameEn ILIKE :keyword)',
				{ keyword: `%${keyword}%` },
			);
		}

		if (startCreatedAt && endCreatedAt) {
			qb.andWhere(
				`issueLevel.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{ startCreatedAt, endCreatedAt },
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			qb.andWhere(
				`issueLevel.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{ startUpdatedAt, endUpdatedAt },
			);
		}

		qb.orderBy(fieldOrder, orderBy);
		qb.skip(skip).take(pageSize);

		return qb;
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
}
