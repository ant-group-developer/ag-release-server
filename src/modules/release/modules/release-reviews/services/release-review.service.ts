import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
	CreateReleaseReviewDto,
	GetListReleaseReviewsDto,
	UpdateReleaseReviewDto,
} from '../dto/release-review.dto';
import { ReleaseReview } from '../entities/release-review.entity';

@Injectable()
export class ReleaseReviewService {
	constructor(
		@InjectRepository(ReleaseReview)
		private readonly repo: Repository<ReleaseReview>,
	) {}

	async create(data: CreateReleaseReviewDto) {
		const entity = this.repo.create({
			releaseId: data.releaseId,
			releaseExecutionId: data.releaseExecutionId,
			status: data.status,
		});

		const review = await this.repo.save(entity);

		return this.findOne(review.id);
	}

	async update(id: string, data: UpdateReleaseReviewDto) {
		const entity = await this.findOne(id);

		if (data.status !== undefined) {
			entity.status = data.status;
		}

		if (data.releaseExecutionId !== undefined) {
			entity.releaseExecutionId = data.releaseExecutionId;
		}

		await this.repo.save(entity);

		return this.findOne(id);
	}

	async findOne(id: string) {
		const entity = await this.repo.findOne({
			where: { id },
			relations: {
				release: true,
				releaseExecution: true,
				releaseErrors: true,
			},
		});

		if (!entity) {
			throw new NotFoundException('Release review not found');
		}

		return entity;
	}

	async getList(filter: GetListReleaseReviewsDto) {
		const { page, pageSize } = filter;
		const qb = this.createQbGetList(filter);

		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: { pageSize, page, totalItems },
		});
	}

	async remove(id: string) {
		const entity = await this.findOne(id);
		await this.repo.remove(entity);
	}

	private createQbGetList(filter: GetListReleaseReviewsDto) {
		const qb = this.repo.createQueryBuilder('releaseReview');
		qb.leftJoinAndSelect('releaseReview.release', 'release');
		qb.leftJoinAndSelect(
			'releaseReview.releaseExecution',
			'releaseExecution',
		);
		qb.leftJoinAndSelect('releaseReview.releaseErrors', 'releaseErrors');
		this.applyFilter({ qb, filter });
		return qb;
	}

	private applyFilter({
		qb,
		filter,
	}: {
		qb: SelectQueryBuilder<ReleaseReview>;
		filter: GetListReleaseReviewsDto;
	}) {
		const {
			releaseId,
			releaseExecutionId,
			keyword,
			status,
			releaseErrorIds,
		} = filter;

		if (releaseId) {
			qb.andWhere('releaseReview.releaseId = :releaseId', { releaseId });
		}

		if (releaseExecutionId) {
			qb.andWhere(
				'releaseReview.releaseExecutionId = :releaseExecutionId',
				{ releaseExecutionId },
			);
		}

		if (keyword?.length) {
			const keywords = keyword.map((k) => `%${k}%`);

			qb.andWhere(
				`(
					releaseReview.status::text ILIKE ANY(:keywords)
				)`,
				{ keywords },
			);
		}

		if (status) {
			qb.andWhere('releaseReview.status = :status', { status });
		}

		if (releaseErrorIds?.length) {
			qb.innerJoin('releaseReview.releaseErrors', 'filterReleaseErrors');
			qb.andWhere('filterReleaseErrors.id IN (:...releaseErrorIds)', {
				releaseErrorIds,
			});
		}

		orderAndPaging2({ qb, filter });
	}
}
