import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
	OneToOne,
} from 'typeorm';
import { Release } from '../../../entities/release.entity';
import { ReleaseError } from '../../release-errors/entities/release-error.entity';
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
	releaseExecutionId?: string | null;

	@OneToOne(
		() => ReleaseExecution3,
		(releaseExecution) => releaseExecution.releaseReview,
		{
			onDelete: 'SET NULL',
			nullable: true,
		},
	)
	@JoinColumn({ name: 'release_execution_id' })
	releaseExecution?: ReleaseExecution3 | null;

	@Column({
		type: 'enum',
		enum: ReleaseReviewStatus,
		default: ReleaseReviewStatus.PENDING,
	})
	status: ReleaseReviewStatus;

	@OneToMany(() => ReleaseError, (releaseError) => releaseError.releaseReview)
	releaseErrors: ReleaseError[];
}
