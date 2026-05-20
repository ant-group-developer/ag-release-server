import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Logs } from 'src/modules/log/entites/logs.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import {
	AfterLoad,
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
} from 'typeorm';
import { ReleaseExecutionResultDto } from '../dtos/release-execution3.dto';
import {
	ExecutionStepFailurePolicy,
	ExecutionType,
	ReleaseExecutionStatus,
	ReleaseExecutionStepStatus,
	ReleaseExecutionStepType,
} from '../enums/release-execution3.enum';

@Entity('release_excutions3')
export class ReleaseExecution3 extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: 50,
		comment:
			'Loại action: VD lần đầu phân phối (INITIAL) hay gỡ (TAKEDOWN)',
	})
	type: ExecutionType;

	@Column({ name: 'release_title', type: 'varchar', length: 255 })
	releaseTitle: string;

	@Column({ name: 'release_upc', type: 'varchar', length: 255 })
	releaseUpc: string;

	@Column({
		name: 'release_id',
		type: 'uuid',
	})
	releaseId: string;

	@ManyToOne(() => Release, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@Column({
		type: 'varchar',
		default: ReleaseExecutionStatus.NEW,
	})
	status: ReleaseExecutionStatus;

	@Column({
		name: 'completed_at',
		type: 'timestamp with time zone',
		nullable: true,
	})
	completedAt: Date | null;

	@Column({
		type: 'text',
		nullable: true,
		comment: 'Summary or error message',
	})
	summary: string | null;

	@OneToMany(() => ReleaseExecutionStep3, (step) => step.releaseExecution)
	steps: ReleaseExecutionStep3[];

	@OneToMany(() => Logs, (log) => log.releaseSubmit)
	logs: Logs[];

	@Column({
		type: 'jsonb',
		nullable: true,
		comment: 'Input data: releaseSnapshot, config, etc.',
	})
	metadata: {
		input: {
			releaseSnapshot: Release;
			dspCodes: string[];
		};
		output: {
			result: ReleaseExecutionResultDto[];
		};
	};

	@AfterLoad()
	sortSteps() {
		if (this.steps) {
			// Chỉ giữ parent steps ở top level, children đã nằm trong childSteps của từng parent
			this.steps = this.steps
				.filter((s) => s.parentStepId === null)
				.sort((a, b) => a.order - b.order);
		}
	}
}

@Entity('release_execution_steps3')
export class ReleaseExecutionStep3 extends BaseUUIDEntity {
	@Column({ name: 'release_execution_id', type: 'uuid' })
	releaseExecutionId: string;

	@ManyToOne(
		() => ReleaseExecution3,
		(releaseExecution) => releaseExecution.steps,
		{
			onDelete: 'CASCADE',
		},
	)
	@JoinColumn({ name: 'release_execution_id' })
	releaseExecution: ReleaseExecution3;

	/** Self-referencing FK for sub-steps */
	@Column({ name: 'parent_step_id', type: 'uuid', nullable: true })
	parentStepId: string | null;

	@ManyToOne(() => ReleaseExecutionStep3, (step) => step.childSteps, {
		onDelete: 'CASCADE',
		nullable: true,
	})
	@JoinColumn({ name: 'parent_step_id' })
	parentStep: ReleaseExecutionStep3 | null;

	@OneToMany(() => ReleaseExecutionStep3, (step) => step.parentStep)
	childSteps: ReleaseExecutionStep3[];

	@OneToMany(() => Logs, (log) => log.releaseSubmitStep)
	logs: Logs[];

	@AfterLoad()
	sortChildSteps() {
		if (this.childSteps) {
			this.childSteps.sort((a, b) => a.order - b.order);
		}
	}

	@Column({ type: 'varchar', length: 50 })
	type: ReleaseExecutionStepType;

	@Column({
		type: 'varchar',
		default: ReleaseExecutionStepStatus.NEW,
	})
	status: ReleaseExecutionStepStatus;

	@Column({ type: 'int', default: 0 })
	order: number;

	@Column({ type: 'jsonb', nullable: true })
	metadata: Record<string, any> | null;

	@Column({
		name: 'started_at',
		type: 'timestamp with time zone',
		nullable: true,
	})
	startedAt: Date | null;

	@Column({
		name: 'completed_at',
		type: 'timestamp with time zone',
		nullable: true,
	})
	completedAt: Date | null;

	@Column({
		name: 'scheduled_at',
		type: 'timestamp with time zone',
		nullable: true,
	})
	scheduledAt: Date | null;

	@Column({ name: 'retry_count', type: 'int', default: 0 })
	retryCount: number;

	@Column({
		name: 'failure_policy',
		type: 'enum',
		enum: ExecutionStepFailurePolicy,
		default: ExecutionStepFailurePolicy.STOP_ALL,
	})
	failurePolicy: ExecutionStepFailurePolicy;
}
