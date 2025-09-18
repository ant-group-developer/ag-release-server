import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { IssueLevel } from 'src/modules/issue-level/entities/issue-level.entity';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { IssueResponse } from '../constants/issue.constant';
import { QueryGetListIssueDto } from '../dto/issue.dto';
import { Issue } from '../entities/issue.entity';

@Injectable()
export class IssueQueryService {
	constructor(
		@InjectRepository(Issue)
		private readonly issueRepo: Repository<Issue>,

		@InjectRepository(IssueLevel)
		private readonly issueLevelRepo: Repository<IssueLevel>,
	) {}

	async getList(query: QueryGetListIssueDto) {
		const qb = this.createQueryGetList(query);

		return qb.getManyAndCount();
	}

	async getListSimple() {
		const qb = this.createBaseQuery();

		this.selectIssueSimple(qb);
		this.addSelectIssueLevel(qb);

		qb.orderBy('issueLevel.severityRank', 'ASC');

		return qb.getMany();
	}

	async validate({
		nameVi,
		nameEn,
		code,
		issueLevelId,
	}: {
		nameVi?: string;
		nameEn?: string;
		code?: string;
		issueLevelId?: string;
	}) {
		if (nameVi) {
			const exist = await this.issueRepo.findOne({ where: { nameVi } });
			if (exist) throw new ResponseError(IssueResponse.DUPLICATE_NAME_VI);
		}
		if (nameEn) {
			const exist = await this.issueRepo.findOne({ where: { nameEn } });
			if (exist) throw new ResponseError(IssueResponse.DUPLICATE_NAME_EN);
		}
		if (code) {
			const exist = await this.issueRepo.findOne({ where: { code } });
			if (exist) throw new ResponseError(IssueResponse.DUPLICATE_CODE);
		}

		if (issueLevelId) {
			const exist = await this.issueLevelRepo.findOne({
				where: { id: issueLevelId },
			});

			if (!exist)
				throw new ResponseError(IssueResponse.ISSUE_LEVEL_NOT_FOUND);
		}
	}

	// private
	private createBaseQuery() {
		const qb = this.issueRepo
			.createQueryBuilder('issue')
			.leftJoin('issue.issueLevel', 'issueLevel');
		return qb;
	}

	private createQueryGetList(filter: QueryGetListIssueDto) {
		const qb = this.createBaseQuery();
		this.applyFilter({ qb, filter });
		this.addSelectIssueLevel(qb);

		return qb;
	}

	private applyFilter({
		qb,
		filter,
	}: {
		filter: QueryGetListIssueDto;
		qb: SelectQueryBuilder<Issue>;
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

			issueLevelId,
		} = filter;

		if (keyword) {
			qb.andWhere(
				'(issue.nameVi ILIKE :keyword OR issue.nameEn ILIKE :keyword OR issue.code ILIKE :keyword)',
				{ keyword: `%${keyword}%` },
			);
		}

		if (startCreatedAt && endCreatedAt) {
			qb.andWhere(
				`issue.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			qb.andWhere(
				`issue.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		if (issueLevelId?.length) {
			qb.andWhere('issue.issueLevelId IN (:...issueLevelId)', {
				issueLevelId,
			});
		}

		qb.orderBy(fieldOrder, orderBy);

		qb.skip(skip).take(pageSize);

		return qb;
	}

	private selectIssueSimple(qb: SelectQueryBuilder<Issue>) {
		return qb.select([
			'issue.id',
			'issue.code',
			'issue.nameVi',
			'issue.nameEn',
			'issue.score',
			'issue.numberOfDaysAffect',
		]);
	}

	private addSelectIssueLevel(qb: SelectQueryBuilder<Issue>) {
		qb.addSelect([
			'issueLevel.id',
			'issueLevel.nameEn',
			'issueLevel.nameVi',
			'issueLevel.code',
			'issueLevel.color',
			'issueLevel.severityRank',
		]);

		return qb;
	}
}
