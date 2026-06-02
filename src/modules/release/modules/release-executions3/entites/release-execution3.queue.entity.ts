import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity } from 'typeorm';

export enum RunPipelineQueueStatus {
	NEW = 'NEW',
	PROCESSING = 'PROCESSING',
	DONE = 'DONE',
	FAILED = 'FAILED',
}

@Entity('release_execution3_run_pipeline_queue')
export class ReleaseExecution3RunPipelineQueue extends BaseUUIDEntity {
	@Column('uuid')
	releaseExecutionId: string;

	@Column({
		type: 'enum',
		enum: RunPipelineQueueStatus,
		default: RunPipelineQueueStatus.NEW,
	})
	status: RunPipelineQueueStatus;

	@Column({ type: 'int', default: 0 })
	attempts: number;

	@Column({ type: 'int', default: 3 })
	maxAttempts: number;

	@Column({ nullable: true })
	error?: string;

	@Column({ type: 'timestamp', nullable: true })
	startedAt?: Date;

	@Column({ type: 'timestamp', nullable: true })
	completedAt?: Date;
}
