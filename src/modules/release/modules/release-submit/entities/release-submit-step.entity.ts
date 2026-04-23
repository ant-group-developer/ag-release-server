import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { AfterLoad, Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { ReleaseSubmit } from './release-submit.entity';
import { SubmitStepStatus, SubmitStepType } from '../release-submit.enum';
import { ReleaseSubmitLog } from './release-submit-log.entity';

@Entity('release_submit_steps')
export class ReleaseSubmitStep extends BaseUUIDEntity {
	@Column({ name: 'release_submit_id', type: 'uuid' })
	releaseSubmitId: string;

	@ManyToOne(() => ReleaseSubmit, (submit) => submit.steps, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'release_submit_id' })
	releaseSubmit: ReleaseSubmit;

	/** Self-referencing FK for sub-steps */
	@Column({ name: 'parent_step_id', type: 'uuid', nullable: true })
	parentStepId: string | null;

	@ManyToOne(() => ReleaseSubmitStep, (step) => step.childSteps, {
		onDelete: 'CASCADE',
		nullable: true,
	})
	@JoinColumn({ name: 'parent_step_id' })
	parentStep: ReleaseSubmitStep | null;

	@OneToMany(() => ReleaseSubmitStep, (step) => step.parentStep)
	childSteps: ReleaseSubmitStep[];

	@OneToMany(() => ReleaseSubmitLog, (log) => log.releaseSubmitStep)
	logs: ReleaseSubmitLog[];

	@AfterLoad()
	sortChildSteps() {
		if (this.childSteps) {
			this.childSteps.sort((a, b) => a.order - b.order);
		}
	}

	/** Step type — varchar in DB for flexibility, enum in code for type safety */
	@Column({ type: 'varchar', length: 50 })
	type: SubmitStepType;

	@Column({
		type: 'enum',
		enum: SubmitStepStatus,
		default: SubmitStepStatus.NEW,
	})
	status: SubmitStepStatus;

	@Column({ type: 'int', default: 0 })
	order: number;

	@Column({ type: 'jsonb', nullable: true })
	dsp: Dsp | null;

	@Column({ type: 'jsonb', nullable: true })
	dsps: Dsp[];

	// /** Single DSP — for PROCESS_DIRECT parent steps */
	// @Column({ name: 'dsp_id', type: 'varchar', length: 10, nullable: true })
	// dspId: string | null;

	// @ManyToOne(() => Dsp, { nullable: true, onDelete: 'SET NULL' })
	// @JoinColumn({ name: 'dsp_id' })
	// dsp: Dsp | null;

	/** Multiple DSP IDs — for PROCESS_AGG_CI parent steps */
	// @Column({ name: 'dsp_ids', type: 'jsonb', nullable: true })
	// dspIds: Array<{ id: string; name: string }> | null;

	/**
	 * Flexible input/output per step type.
	 * e.g. genUpc: { input: { prefixUpcId }, output: { upc } }
	 * e.g. createMetadataDirect: { input: { ernVersion }, output: { xmlPath } }
	 */
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

	@Column({ name: 'retry_count', type: 'int', default: 0 })
	retryCount: number;
}
