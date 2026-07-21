import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { ReleaseExecutionStep3 } from 'src/modules/release/modules/release-executions3/entites/release-execution3-step.entity';
import { ReleaseExecution3 } from 'src/modules/release/modules/release-executions3/entites/release-execution3.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

export enum LogLevel {
	INFO = 'INFO',
	SUCCESS = 'SUCCESS',
	WARNING = 'WARNING',
	ERROR = 'ERROR',
}

export enum LogCategory {
	BUSINESS = 'BUSINESS',
	SYSTEM = 'SYSTEM',
}

export enum LogModule {
	// Release
	RELEASE = 'RELEASE',
	RELEASE_EXECUTION = 'RELEASE_EXECUTION',

	// Vevo
	VEVO_REQUEST = 'VEVO_REQUEST',
	VEVO_WEBHOOK = 'VEVO_WEBHOOK',

	// Common
	COMMON = 'COMMON',
}

@Entity('logs')
export class Logs extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		default: LogLevel.INFO,
	})
	level: LogLevel;

	@Column({
		type: 'varchar',
		default: LogCategory.BUSINESS,
	})
	type: LogCategory;

	@Column({
		type: 'varchar',
		nullable: true,
	})
	module: LogModule | null;

	@Column({ type: 'text', nullable: true })
	message: string | null;

	@Column({ type: 'jsonb', nullable: true })
	data: Record<string, any> | null;

	// relations
	/** FK tới ReleaseSubmit — log cấp submit */
	@Column({ name: 'release_submit_id', type: 'uuid', nullable: true })
	releaseSubmitId: string | null;

	/** FK tới ReleaseSubmitStep — log cấp step */
	@Column({ name: 'release_submit_step_id', type: 'uuid', nullable: true })
	releaseSubmitStepId: string | null;

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
