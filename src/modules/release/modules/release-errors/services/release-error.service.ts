import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
	FieldErrorDetails,
	PageDto,
} from 'src/common/dtos/common.response.dto';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ReleaseReviewStatus } from '../../release-reviews/entities/release-review.entity';
import {
	CreateReleaseErrorDto,
	GetListReleaseErrorsDto,
	UpdateReleaseErrorDto,
} from '../dto/release-error.dto';
import {
	ErrorApprovalStatus,
	ErrorSubmissionStatus,
	ReleaseError,
} from '../entities/release-error.entity';

@Injectable()
export class ReleaseErrorService {
	constructor(
		@InjectRepository(ReleaseError)
		private readonly repo: Repository<ReleaseError>,
	) {}

	async bulkCreateErrors(data: CreateReleaseErrorDto[], userId?: string) {
		const entities = this.repo.create(
			data.map((item) => ({
				...item,
				reviewerId: userId,
			})),
		);
		return this.repo.save(entities);
	}

	async bulkUpdateErrors(data: UpdateReleaseErrorDto[], userId: string) {
		const dataParsedStatus = this.processStatusList(data, userId);

		const entities = this.repo.create(dataParsedStatus);
		return this.repo.save(entities);
	}

	async bulkUpdateErrorsByReviewResult({
		releaseId,
		status,
		reviewerId,
	}: {
		releaseId: string;
		status: ReleaseReviewStatus.COMPLETED | ReleaseReviewStatus.FAILED;
		reviewerId: string;
	}) {
		const approvalStatus =
			status === ReleaseReviewStatus.COMPLETED
				? ErrorApprovalStatus.APPROVED
				: ErrorApprovalStatus.REJECTED;

		const filter = new GetListReleaseErrorsDto();
		filter.releaseId = releaseId;
		filter.page = 1;
		filter.pageSize = 10000;

		const listErrors = await this.getListErrors(filter);
		const items = listErrors.items
			.filter(
				(item) => item.approvalStatus !== ErrorApprovalStatus.APPROVED,
			)
			.map((item) => ({
				id: item.id,
				approvalStatus,
			}));

		return this.bulkUpdateErrors(items, reviewerId);
	}

	private processStatusList(
		data: UpdateReleaseErrorDto[],
		userId: string,
	): Partial<ReleaseError>[] {
		return data.map((item) => {
			const update: Partial<ReleaseError> = { ...item };

			if (item.approvalStatus === ErrorApprovalStatus.APPROVED) {
				update.submissionStatus = ErrorSubmissionStatus.FIXED;
				update.reviewerId = userId;
			} else if (item.approvalStatus === ErrorApprovalStatus.REJECTED) {
				update.submissionStatus = ErrorSubmissionStatus.OPEN;
				update.reviewerId = userId;
			} else if (item.submissionStatus === ErrorSubmissionStatus.FIXED) {
				update.approvalStatus = ErrorApprovalStatus.PENDING;
				update.submitterId = userId;
			}

			return update;
		});
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
		return result;

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
					id: error.id,
				}),
		);
	}

	private createQbGetList(filter: GetListReleaseErrorsDto) {
		const qb = this.repo.createQueryBuilder('releaseError');
		qb.leftJoinAndSelect('releaseError.release', 'release');
		qb.leftJoinAndSelect('releaseError.submitter', 'submitter');
		qb.leftJoinAndSelect('releaseError.reviewer', 'reviewer');
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
			submissionStatus,
			approvalStatus,
			releaseExecutionId,
			stepId,
			releaseReviewId,
		} = filter;

		if (releaseId) {
			qb.andWhere('releaseError.releaseId = :releaseId', { releaseId });
		}

		if (keyword?.length) {
			const keywords = keyword.map((k) => `%${k}%`);

			qb.andWhere(
				`(
					"releaseError"."message" ILIKE ANY(:keywords)
					OR releaseError.messageCode ILIKE ANY(:keywords)
					OR "releaseError"."type"::text ILIKE ANY(:keywords)
					OR "releaseError"."submission_status"::text ILIKE ANY(:keywords)
					OR "releaseError"."approval_status"::text ILIKE ANY(:keywords)
				)`,
				{ keywords },
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

		if (releaseReviewId) {
			qb.andWhere('releaseError.releaseReviewId = :releaseReviewId', {
				releaseReviewId,
			});
		}

		if (type) {
			qb.andWhere('releaseError.type = :type', { type });
		}

		if (submissionStatus) {
			qb.andWhere('releaseError.submissionStatus = :submissionStatus', {
				submissionStatus,
			});
		}

		if (approvalStatus) {
			qb.andWhere('releaseError.approvalStatus = :approvalStatus', {
				approvalStatus,
			});
		}

		orderAndPaging2({ qb, filter });
	}
}
