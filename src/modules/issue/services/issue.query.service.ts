import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { IssueLevel } from 'src/modules/issue-level/entities/issue-level.entity';
import { Repository } from 'typeorm';
import { IssueMessage } from '../constants/issue.constant';
import { QueryGetListIssueDto } from '../dto/issue.dto';
import { Issue } from '../entities/issue.entity';
import { FieldOrderIssue } from '../enum/issue.enum';

@Injectable()
export class IssueQueryService {
	constructor(
		@InjectRepository(Issue)
		private readonly issueRepo: Repository<Issue>,

		@InjectRepository(IssueLevel)
		private readonly issueLevelRepo: Repository<IssueLevel>,
	) {}

	private createQueryGetList(query: QueryGetListIssueDto) {
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

		const qb = this.issueRepo.createQueryBuilder('issue');

		qb.leftJoin('issue.issueLevel', 'issueLevel');

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

		if (fieldOrder === FieldOrderIssue.ISSUE_LEVEL) {
			qb.orderBy('issueLevel.severityRank', orderBy);
		} else {
			qb.orderBy(`issue.${fieldOrder}`, orderBy);
		}

		qb.skip(skip).take(pageSize);

		return qb;
	}

	async getList(query: QueryGetListIssueDto) {
		const qb = this.createQueryGetList(query);
		qb.addSelect([
			'issueLevel.id',
			'issueLevel.nameEn',
			'issueLevel.nameVi',
			'issueLevel.code',
			'issueLevel.color',
			'issueLevel.severityRank',
		]);
		return qb.getManyAndCount();
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
			if (exist) throw new ResponseError(IssueMessage.DUPLICATE_NAME_VI);
		}
		if (nameEn) {
			const exist = await this.issueRepo.findOne({ where: { nameEn } });
			if (exist) throw new ResponseError(IssueMessage.DUPLICATE_NAME_EN);
		}
		if (code) {
			const exist = await this.issueRepo.findOne({ where: { code } });
			if (exist) throw new ResponseError(IssueMessage.DUPLICATE_CODE);
		}

		if (issueLevelId) {
			const exist = await this.issueLevelRepo.findOne({
				where: { id: issueLevelId },
			});

			if (!exist)
				throw new ResponseError(IssueMessage.ISSUE_LEVEL_NOT_FOUND);
		}
	}

	async getListSimple() {
		return this.issueRepo
			.createQueryBuilder('issue')
			.leftJoin('issue.issueLevel', 'issueLevel')
			.select([
				'issue.id',
				'issue.code',
				'issue.nameVi',
				'issue.nameEn',
				'issueLevel.id',
				'issueLevel.nameEn',
				'issueLevel.nameVi',
				'issueLevel.code',
				'issueLevel.color',
				'issueLevel.severityRank',
			])
			.orderBy('issueLevel.severityRank', 'ASC')
			.getMany();
	}
}
