import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
	FieldErrorDetails,
	PageDto,
} from 'src/common/dtos/common.response.dto';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
	CreateReleaseErrorDto,
	GetListReleaseErrorsDto,
	UpdateReleaseErrorDto,
} from '../dto/release-error.dto';
import { ReleaseError } from '../entities/release-error.entity';

@Injectable()
export class ReleaseErrorService {
	constructor(
		@InjectRepository(ReleaseError)
		private readonly repo: Repository<ReleaseError>,
	) {}

	async bulkCreateErrors(data: CreateReleaseErrorDto[]) {
		const entities = this.repo.create(data);
		return this.repo.save(entities);
	}

	async bulkUpdateErrors(data: UpdateReleaseErrorDto[]) {
		const entities = this.repo.create(data);
		return this.repo.save(entities);
	}

	async getListErrors(filter: GetListReleaseErrorsDto) {
		const { page, pageSize } = filter;
		const qb = this.createQbGetList(filter);

		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: { pageSize, page, totalItems },
		});
	}

	async getEnrichedErrors(filter: GetListReleaseErrorsDto) {
		const result = await this.getListErrors(filter);
		return this.enrichData(result.items);
	}

	enrichData(errors: ReleaseError[]): FieldErrorDetails[] {
		return errors.map(
			(error) =>
				new FieldErrorDetails({
					messageCode: error.messageCode ?? undefined,
					message: error.message,
					page: error.page ?? undefined,
					field: error.field ?? undefined,
					trackId: error.trackId ?? undefined,
					isFix: error.isFixed,
				}),
		);
	}

	private createQbGetList(filter: GetListReleaseErrorsDto) {
		const qb = this.repo.createQueryBuilder('releaseError');
		qb.leftJoinAndSelect('releaseError.release', 'release');
		this.applyFilter({ qb, filter });
		return qb;
	}

	private applyFilter({
		qb,
		filter,
	}: {
		qb: SelectQueryBuilder<ReleaseError>;
		filter: GetListReleaseErrorsDto;
	}) {
		const {
			releaseId,
			keyword,
			messageCode,
			type,
			isFixed,
			releaseExecutionId,
			stepId,
		} = filter;

		if (releaseId) {
			qb.andWhere('releaseError.releaseId = :releaseId', { releaseId });
		}

		if (keyword?.length) {
			const keywords = keyword.map((k) => `%${k}%`);
			const booleanKeywords = keyword
				.map((k) => k.toLowerCase())
				.filter((k) => ['true', 'false'].includes(k))
				.map((k) => k === 'true');

			qb.andWhere(
				`(
					releaseError.message ILIKE ANY(:keywords)
					OR releaseError.messageCode ILIKE ANY(:keywords)
					OR releaseError.type::text ILIKE ANY(:keywords)
					${
						booleanKeywords.length
							? 'OR releaseError.isFixed IN (:...booleanKeywords)'
							: ''
					}
				)`,
				{ keywords, booleanKeywords },
			);
		}

		if (messageCode) {
			qb.andWhere('releaseError.messageCode = :messageCode', {
				messageCode,
			});
		}

		if (releaseExecutionId) {
			qb.andWhere(
				'releaseError.releaseExecutionId = :releaseExecutionId',
				{
					releaseExecutionId,
				},
			);
		}

		if (stepId) {
			qb.andWhere('releaseError.stepId = :stepId', { stepId });
		}

		if (type) {
			qb.andWhere('releaseError.type = :type', { type });
		}

		if (isFixed !== undefined) {
			qb.andWhere('releaseError.isFixed = :isFixed', { isFixed });
		}

		orderAndPaging2({ qb, filter });
	}
}
