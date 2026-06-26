import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Release } from '../../../entities/release.entity';
import { ReleaseExecutionStep3 } from '../../release-executions3/entites/release-execution3-step.entity';
import { ReleaseExecution3 } from '../../release-executions3/entites/release-execution3.entity';
import { ReleaseReview } from '../../release-reviews/entities/release-review.entity';

export enum ReleaseErrorType {
	ADMIN_CREATE = 'admin_create',
	IMPORT_CI = 'import_ci',
	QA_FLAG_CI = 'qa_flag_ci',
}

@Entity('release_errors')
export class ReleaseError extends BaseUUIDEntity {
	@Column({ type: 'uuid' })
	releaseId: string;

	@ManyToOne(() => Release, (release) => release.errors, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@Column({ name: 'release_execution_id', type: 'uuid', nullable: true })
	releaseExecutionId?: string | null;

	@ManyToOne(
		() => ReleaseExecution3,
		(releaseExecution) => releaseExecution.releaseErrors,
		{
			onDelete: 'SET NULL',
			nullable: true,
		},
	)
	@JoinColumn({ name: 'release_execution_id' })
	releaseExecution?: ReleaseExecution3 | null;

	@Column({ name: 'step_id', type: 'uuid', nullable: true })
	stepId?: string | null;

	@ManyToOne(() => ReleaseExecutionStep3, (step) => step.releaseErrors, {
		onDelete: 'SET NULL',
		nullable: true,
	})
	@JoinColumn({ name: 'step_id' })
	step?: ReleaseExecutionStep3 | null;

	@Column({ type: 'boolean', name: 'is_fixed', default: false })
	isFixed: boolean;

	@Column({ type: 'varchar', nullable: true })
	messageCode?: string | null;

	@Column({ type: 'text' })
	message: string;

	@Column({ type: 'varchar', nullable: true })
	page?: string | null;

	@Column({ type: 'varchar', nullable: true })
	field?: string | null;

	@Column({ type: 'uuid', nullable: true })
	trackId?: string | null;

	@Column({
		type: 'enum',
		enum: ReleaseErrorType,
		nullable: true,
	})
	type?: ReleaseErrorType | null;

	@Column({ name: 'release_review_id', type: 'uuid', nullable: true })
	releaseReviewId?: string | null;

	@ManyToOne(() => ReleaseReview, (review) => review.releaseErrors, {
		onDelete: 'SET NULL',
		nullable: true,
	})
	@JoinColumn({ name: 'release_review_id' })
	releaseReview?: ReleaseReview | null;
}
