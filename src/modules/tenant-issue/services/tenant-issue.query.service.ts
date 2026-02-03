import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { Issue } from 'src/modules/issue/entities/issue.entity';
import { IssueLevelJoinCoreFields } from 'src/modules/orm/filed-mappings/orm.issue-level.constant';
import { IssueJoinCoreFields } from 'src/modules/orm/filed-mappings/orm.issue.constant';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
	TenantIssueCoreFields,
	TenantJoinCoreFields,
} from '../../orm/filed-mappings/orm.tenant-issue.constant';
import { TenantIssueResponse } from '../constants/tenant-issue.constant';
import { QueryGetListTenantIssueDto } from '../dto/tenant-issue.dto';
import { TenantIssue } from '../entities/tenant-issue.entity';

@Injectable()
export class TenantIssueQueryService {
	constructor(
		@InjectRepository(TenantIssue)
		private readonly tenantIssueRepo: Repository<TenantIssue>,
		@InjectRepository(Tenant)
		private readonly tenantRepo: Repository<Tenant>,
		@InjectRepository(Issue)
		private readonly issueRepo: Repository<Issue>,
	) {}

	async getList(query: QueryGetListTenantIssueDto) {
		const qb = this.createQueryGetList(query);
		const [items, totalItems] = await qb.getManyAndCount();
		return { items, totalItems };
	}

	async validate({
		tenantId,
		issueId,
	}: {
		tenantId?: string;
		issueId?: string;
	}) {
		if (tenantId) {
			const exist = await this.tenantRepo.findOne({
				where: { id: tenantId },
			});

			if (!exist)
				throw new ResponseError(TenantIssueResponse.TENANT_NOT_FOUND);
		}

		if (issueId) {
			const exist = await this.issueRepo.findOne({
				where: { id: issueId },
			});

			if (!exist)
				throw new ResponseError(TenantIssueResponse.ISSUE_NOT_FOUND);
		}
	}

	// private
	private createBaseQuery() {
		return this.tenantIssueRepo
			.createQueryBuilder('tenantIssue')
			.leftJoinAndSelect('tenantIssue.tenant', 'tenant')
			.leftJoinAndSelect('tenantIssue.issue', 'issue')
			.leftJoinAndSelect('issue.issueLevel', 'issueLevel');
	}

	private createQueryGetList(filter: QueryGetListTenantIssueDto) {
		const qb = this.createBaseQuery();
		this.applyFilter({ qb, filter });
		this.selectTenantIssue(qb);
		this.addSelectTenant(qb);
		this.addSelectIssue(qb);
		this.addSelectIssueLevelColor(qb);

		return qb;
	}

	private selectTenantIssue(qb: SelectQueryBuilder<TenantIssue>) {
		qb.select(Object.values(TenantIssueCoreFields));
	}

	private addSelectTenant(qb: SelectQueryBuilder<TenantIssue>) {
		return qb.addSelect(Object.values(TenantJoinCoreFields));
	}

	private addSelectIssue(qb: SelectQueryBuilder<TenantIssue>) {
		return qb.addSelect(Object.values(IssueJoinCoreFields));
	}

	private addSelectIssueLevel(qb: SelectQueryBuilder<TenantIssue>) {
		qb.addSelect(Object.values(IssueLevelJoinCoreFields));

		return qb;
	}

	private addSelectIssueLevelColor(qb: SelectQueryBuilder<TenantIssue>) {
		qb.addSelect([
			IssueLevelJoinCoreFields.ID,
			IssueLevelJoinCoreFields.COLOR,
		]);

		return qb;
	}

	private applyFilter({
		filter,
		qb,
	}: {
		filter: QueryGetListTenantIssueDto;
		qb: SelectQueryBuilder<TenantIssue>;
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
				'(issue.nameVi ILIKE :keyword OR issue.nameEn ILIKE :keyword OR tenant.name ILIKE :keyword)',
				{ keyword: `%${keyword}%` },
			);
		}

		if (startCreatedAt && endCreatedAt) {
			qb.andWhere(
				`tenantIssue.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			qb.andWhere(
				`tenantIssue.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
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
}
