import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { Release } from '../../../entities/release.entity';
import { ReleaseError } from '../../release-errors/entities/release-error.entity';
import { ReleaseExecutionStep3 } from '../../release-executions3/entites/release-execution3-step.entity';
import { ReleaseExecution3 } from '../../release-executions3/entites/release-execution3.entity';

export enum ReleaseReviewStatus {
	PENDING = 'PENDING',
	PROCESSING = 'PROCESSING',
	COMPLETED = 'COMPLETED',
	FAILED = 'FAILED',
	CANCEL = 'CANCEL',
}

@Entity('release_reviews')
export class ReleaseReview extends BaseUUIDEntity {
	@Column({ type: 'uuid' })
	releaseId: string;

	@ManyToOne(() => Release, (release) => release.reviews, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@Column({ name: 'release_execution_id', type: 'uuid', nullable: true })
	releaseExecutionId: string | null;

	@ManyToOne(() => ReleaseExecution3, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'release_execution_id' })
	releaseExecution?: ReleaseExecution3 | null;

	@Column({ name: 'step_id', type: 'uuid', nullable: true })
	stepId: string | null;

	@ManyToOne(() => ReleaseExecutionStep3, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'step_id' })
	step: ReleaseExecutionStep3 | null;

	@Column({ name: 'reviewer_id', type: 'uuid', nullable: true })
	reviewerId: string | null;

	@ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'reviewer_id' })
	reviewer?: User | null;

	@Column({ type: 'text', nullable: true })
	note: string | null;

	@Column({
		type: 'enum',
		enum: ReleaseReviewStatus,
		default: ReleaseReviewStatus.PENDING,
	})
	status: ReleaseReviewStatus;

	@OneToMany(() => ReleaseError, (releaseError) => releaseError.releaseReview)
	releaseErrors: ReleaseError[];
}
