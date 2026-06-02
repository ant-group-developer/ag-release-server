import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { ReleaseExecutionStep3 } from 'src/modules/release/modules/release-executions3/entites/release-execution3-step.entity';
import { ReleaseExecution3 } from 'src/modules/release/modules/release-executions3/entites/release-execution3.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ReleaseSubmitStep } from '../../release/modules/release-submit/entities/release-submit-step.entity';
import { ReleaseSubmit } from '../../release/modules/release-submit/entities/release-submit.entity';

export enum LogLevel {
	SUCCESS = 'SUCCESS',
	LOG = 'LOG',
	ERROR = 'ERROR',
	WARNING = 'WARNING',
}

export enum ErrorType {
	BUSINESS = 'BUSINESS',
	SYSTEM = 'SYSTEM',
}

@Entity('logs')
export class Logs extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		default: LogLevel.LOG,
	})
	level: LogLevel;

	@Column({
		type: 'varchar',
		default: ErrorType.BUSINESS,
	})
	type: ErrorType;

	@Column({
		type: 'varchar',
		default: LogLevel.LOG,
		nullable: true,
	})
	module: string | null;

	@Column({ type: 'text', nullable: true })
	message: string | null;

	@Column({ type: 'jsonb', nullable: true })
	data: Record<string, any> | null;

	// relations
	/** FK tới ReleaseSubmit — log cấp submit */
	@Column({ name: 'release_submit_id', type: 'uuid', nullable: true })
	releaseSubmitId: string | null;

	@ManyToOne(() => ReleaseSubmit, { onDelete: 'CASCADE', nullable: true })
	@JoinColumn({ name: 'release_submit_id' })
	releaseSubmit: ReleaseSubmit | null;

	/** FK tới ReleaseSubmitStep — log cấp step */
	@Column({ name: 'release_submit_step_id', type: 'uuid', nullable: true })
	releaseSubmitStepId: string | null;

	@ManyToOne(() => ReleaseSubmitStep, { onDelete: 'CASCADE', nullable: true })
	@JoinColumn({ name: 'release_submit_step_id' })
	releaseSubmitStep: ReleaseSubmitStep | null;

	// v3
	// relations
	/** FK tới ReleaseExecution — log cấp execution */
	@Column({ name: 'release_execution_id', type: 'uuid', nullable: true })
	releaseExecutionId: string | null;

	@ManyToOne(() => ReleaseExecution3, { onDelete: 'CASCADE', nullable: true })
	@JoinColumn({ name: 'release_execution_id' })
	releaseExecution: ReleaseExecution3 | null;

	/** FK tới ReleaseExecutionStep — log cấp step */
	@Column({ name: 'release_execution_step_id', type: 'uuid', nullable: true })
	releaseExecutionStepId: string | null;

	@ManyToOne(() => ReleaseExecutionStep3, {
		onDelete: 'CASCADE',
		nullable: true,
	})
	@JoinColumn({ name: 'release_execution_step_id' })
	releaseExecutionStep: ReleaseExecutionStep3 | null;
}
