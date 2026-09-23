import {
	BadRequestException,
	Inject,
	Injectable,
	NotFoundException,
	forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { OrderDirection } from 'src/common/enums/common';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { ReleaseErrorService } from 'src/modules/release/modules/release-errors/services/release-error.service';
import { ReleaseExecution3Service } from 'src/modules/release/modules/release-executions3/services/release-execution3.service';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { ReleaseExecutionStepStatus } from '../../release-executions3/enums/release-execution3.enum';
import {
	CreateReleaseReviewDto,
	FieldOrderReleaseReview,
	GetListReleaseReviewsDto,
	UpdateReleaseReviewDecisionDto,
	UpdateReleaseReviewDto,
} from '../dto/release-review.dto';
import {
	ReleaseReview,
	ReleaseReviewStatus,
} from '../entities/release-review.entity';

@Injectable()
export class ReleaseReviewService {
	constructor(
		@InjectRepository(ReleaseReview)
		private readonly repo: Repository<ReleaseReview>,

		@Inject(forwardRef(() => ReleaseErrorService))
		private readonly releaseErrorService: ReleaseErrorService,

		@Inject(forwardRef(() => ReleaseExecution3Service))
		private readonly releaseExecutionService: ReleaseExecution3Service,
	) {}

	async create(data: CreateReleaseReviewDto) {
		const entity = this.repo.create({
			releaseId: data.releaseId,
			releaseExecutionId: data.releaseExecutionId,
			status: data.status,
			stepId: data.stepId,
			note: data.note,
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

		if (data.note !== undefined) {
			entity.note = data.note;
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
				reviewer: true,
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

	async findLatestByReleaseIdOrCreate({
		data,
		orCreate = true,
	}: {
		data: CreateReleaseReviewDto;
		orCreate?: boolean;
	}) {
		const { releaseId } = data;

		try {
			const filter = new GetListReleaseReviewsDto();
			filter.releaseId = releaseId;
			filter.page = 1;
			filter.pageSize = 1;
			filter.fieldOrder = FieldOrderReleaseReview.createdAt;
			filter.orderBy = OrderDirection.DESC;

			const result = await this.getList(filter);
			const review = result.items[0];

			if (!review) {
				throw new NotFoundException('Release review not found');
			}

			if (
				![
					ReleaseReviewStatus.PENDING,
					ReleaseReviewStatus.PROCESSING,
				].includes(review.status)
			) {
				throw new BadRequestException(
					'Review này đã được xử lý hoặc không còn chờ duyệt',
				);
			}

			if (!review.stepId && data.stepId) {
				review.stepId = data.stepId;
				await this.repo.save(review);
			}

			return review;
		} catch (error) {
			if (orCreate) {
				console.log(error, 'Đã tạo mới');

				return await this.create(data);
			} else throw new NotFoundException('Release review not found');
		}
	}

	async findLatestPendingByReleaseId(releaseId: string) {
		const review = await this.repo.findOne({
			where: {
				releaseId,
				status: In([
					ReleaseReviewStatus.PENDING,
					ReleaseReviewStatus.PROCESSING,
				]),
			},
			order: {
				createdAt: 'DESC',
			},
		});

		if (!review) {
			throw new NotFoundException(
				'Không tìm thấy release review đang chờ xử lý',
			);
		}

		return review;
	}

	async findOrCreateByExecutionStep({
		data,
	}: {
		data: {
			releaseId: string;
			releaseExecutionId: string;
			stepId: string;
			note?: string | null;
		};
	}) {
		const review = await this.repo.findOne({
			where: {
				releaseId: data.releaseId,
				releaseExecutionId: data.releaseExecutionId,
				stepId: data.stepId,
			},
			order: {
				createdAt: 'DESC',
			},
		});

		if (review) {
			return review;
		}

		return this.create({
			releaseId: data.releaseId,
			releaseExecutionId: data.releaseExecutionId,
			stepId: data.stepId,
			status: ReleaseReviewStatus.PENDING,
			note: data.note,
		});
	}

	async handleResultReviewRelease(
		releaseId: string,
		body: UpdateReleaseReviewDecisionDto,
		reviewerId: string,
	) {
		const waitingStep =
			await this.releaseExecutionService.findWaitingManualReviewStep(
				releaseId,
			);

		if (!waitingStep) {
			throw new BadRequestException(
				'Bản phát hành không đang trong trạng thái đợi duyệt!',
			);
		}

		const stepStatus =
			body.status === ReleaseReviewStatus.COMPLETED
				? ReleaseExecutionStepStatus.DONE
				: ReleaseExecutionStepStatus.FAILED;

		// Chỉ tạo release review khi admin đã quyết định.
		const review = await this.create({
			releaseId,
			releaseExecutionId: waitingStep.releaseExecutionId,
			stepId: waitingStep.id,
			status: body.status,
			note: body.note ?? null,
		});

		await this.repo.update({ id: review.id }, { reviewerId });

		const result = await this.releaseExecutionService.resolveManualReview({
			executionId: waitingStep.releaseExecutionId,
			reviewStatus: body.status,
			stepStatus,
		});

		await this.releaseErrorService.bulkUpdateErrorsByReviewResult({
			releaseId,
			status: body.status,
			reviewerId,
		});

		if (body.status === ReleaseReviewStatus.FAILED) {
			await this.releaseErrorService.createManualReviewError({
				releaseId,
				releaseExecutionId: waitingStep.releaseExecutionId,
				releaseReviewId: review.id,
				stepId: waitingStep.id,
				message: body.note?.trim() ?? '',
				reviewerId,
			});
		}

		return result;
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
		qb.leftJoinAndSelect('releaseReview.reviewer', 'reviewer');
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
					OR releaseReview.note ILIKE ANY(:keywords)
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

	async handleBulkResultReviewRelease(
		releaseIds: string[],
		body: UpdateReleaseReviewDecisionDto,
		reviewerId: string,
	) {
		const uniqueReleaseIds = [...new Set(releaseIds)];

		let succeeded = 0;
		let failed = 0;

		for (const releaseId of uniqueReleaseIds) {
			try {
				await this.handleResultReviewRelease(
					releaseId,
					body,
					reviewerId,
				);

				succeeded++;
			} catch {
				failed++;
			}
		}

		return {
			message: `Đã xử lý ${succeeded} bản thành công, ${failed} bản thất bại`,
		};
	}
}
