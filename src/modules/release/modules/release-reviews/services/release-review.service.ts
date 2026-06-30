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
import {
	ErrorApprovalStatus,
	ErrorSubmissionStatus,
	ReleaseError,
} from 'src/modules/release/modules/release-errors/entities/release-error.entity';
import { ReleaseExecutionStepStatus } from 'src/modules/release/modules/release-executions3/enums/release-execution3.enum';
import { ReleaseExecution3Service } from 'src/modules/release/modules/release-executions3/services/release-execution3.service';
import { Repository, SelectQueryBuilder } from 'typeorm';
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

		@InjectRepository(ReleaseError)
		private readonly releaseErrorRepo: Repository<ReleaseError>,

		@Inject(forwardRef(() => ReleaseExecution3Service))
		private readonly releaseExecutionService: ReleaseExecution3Service,
	) {}

	async create(data: CreateReleaseReviewDto) {
		const entity = this.repo.create({
			releaseId: data.releaseId,
			releaseExecutionId: data.releaseExecutionId,
			status: data.status,
			stepId: data.stepId,
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

	async findLatestByReleaseId(releaseId: string) {
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

		return review;
	}

	async handleResultReviewRelease(
		releaseId: string,
		body: UpdateReleaseReviewDecisionDto,
	) {
		const review = await this.findLatestByReleaseId(releaseId);

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

		if (!review.stepId) {
			throw new BadRequestException('Release review step not found');
		}

		const stepStatus =
			body.status === ReleaseReviewStatus.COMPLETED
				? ReleaseExecutionStepStatus.DONE
				: ReleaseExecutionStepStatus.FAILED;
		const approvalStatus =
			body.status === ReleaseReviewStatus.COMPLETED
				? ErrorApprovalStatus.APPROVED
				: ErrorApprovalStatus.REJECTED;

		// cập nhật trạng thái của submissionStatus và approvalStatus thành đã xử lý
		await this.releaseErrorRepo.update(
			{
				releaseId,
				// approvalStatus: ErrorApprovalStatus.PENDING,
			},
			{
				submissionStatus: ErrorSubmissionStatus.FIXED,
				approvalStatus,
			},
		);

		review.status = body.status;
		await this.repo.save(review);

		await this.releaseExecutionService.updateStatusStepAndRerunPipeline({
			stepId: review.stepId,
			status: stepStatus,
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
