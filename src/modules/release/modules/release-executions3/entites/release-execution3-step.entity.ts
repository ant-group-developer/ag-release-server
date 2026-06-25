import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Logs } from 'src/modules/log/entites/logs.entity';
import { ReleaseError } from 'src/modules/release/modules/release-errors/entities/release-error.entity';
import {
	AfterLoad,
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
} from 'typeorm';
import {
	ReleaseExecutionStepStatus,
	ReleaseExecutionStepType,
} from '../enums/release-execution3.enum';
import { ReleaseExecution3 } from './release-execution3.entity';

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
	childSteps?: ReleaseExecutionStep3[];

	@OneToMany(() => Logs, (log) => log.releaseExecutionStep, {
		persistence: false,
	})
	logs: Logs[];

	@OneToMany(() => ReleaseError, (error) => error.step)
	releaseErrors: ReleaseError[];

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
		name: 'is_delivery_step',
		type: 'boolean',
		default: false,
		comment: 'Đánh dấu step trả về kết quả cho bảng release_dsp_delivery',
	})
	isDeliveryStep: boolean;

	@Column({
		name: 'child_execution_mode',
		type: 'varchar',
		default: 'sequential',
		comment:
			'Chế độ thực thi các step con: sequential (tuần tự) hoặc parallel (song song)',
	})
	childExecutionMode: 'sequential' | 'parallel';

	@AfterLoad()
	sortChildSteps() {
		if (this.childSteps) {
			this.childSteps.sort((a, b) => a.order - b.order);
		}
	}
}
