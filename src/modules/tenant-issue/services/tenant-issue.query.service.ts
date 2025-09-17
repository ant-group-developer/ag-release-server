import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Issue } from 'src/modules/issue/entities/issue.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { Repository } from 'typeorm';
import { TenantIssueMessage } from '../constants/tenant-issue.constant';
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

	private createQueryGetList(query: QueryGetListTenantIssueDto) {
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

		const qb = this.tenantIssueRepo
			.createQueryBuilder('tenantIssue')
			.leftJoinAndSelect('tenantIssue.tenant', 'tenant')
			.leftJoinAndSelect('tenantIssue.issue', 'issue');

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

		qb.orderBy(`tenantIssue.${fieldOrder}`, orderBy);
		qb.skip(skip).take(pageSize);

		return qb;
	}

	async getList(query: QueryGetListTenantIssueDto) {
		const qb = this.createQueryGetList(query);
		return qb.getManyAndCount();
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
				throw new ResponseError(TenantIssueMessage.TENANT_NOT_FOUND);
		}

		if (issueId) {
			const exist = await this.issueRepo.findOne({
				where: { id: issueId },
			});

			if (!exist)
				throw new ResponseError(TenantIssueMessage.ISSUE_NOT_FOUND);
		}
	}
}
