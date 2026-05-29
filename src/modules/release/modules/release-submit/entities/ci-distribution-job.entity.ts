import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ReleaseSubmitStep } from './release-submit-step.entity';
import { ReleaseSubmit } from './release-submit.entity';

export enum CiJobType {
	EMAIL_STATE51 = 'email_state51',
	ADMIN_EXPORT = 'admin_export',
}

export enum CiJobStatus {
	PENDING = 'pending',
	PROCESSING = 'processing',
	COMPLETED = 'completed',
	FAILED = 'failed',
	SKIPPED = 'skipped',
}

@Entity('ci_distribution_jobs')
export class CiDistributionJob extends BaseUUIDEntity {
	@Column({ type: 'varchar', length: 30 })
	type: CiJobType;

	@Column({ type: 'varchar', nullable: true })
	upc: string | null;

	@Column({ type: 'varchar', nullable: true })
	note: string | null;

	@Column({ name: 'dsp_ci_codes', type: 'jsonb', default: [] })
	dspCiCodes: string[];

	@Column({ name: 'release_submit_id', type: 'uuid' })
	releaseSubmitId: string;

	@ManyToOne(() => ReleaseSubmit, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'release_submit_id' })
	releaseSubmit: ReleaseSubmit;

	@Column({ name: 'step_id', type: 'uuid' })
	stepId: string;

	@ManyToOne(() => ReleaseSubmitStep, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'step_id' })
	step: ReleaseSubmitStep;

	@Column({ name: 'release_id', type: 'uuid', nullable: true })
	releaseId: string | null;

	@ManyToOne(() => Release, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@Column({
		type: 'varchar',
		length: 20,
		default: CiJobStatus.PENDING,
	})
	status: CiJobStatus;

	@Column({ name: 'delivery_email', type: 'varchar', nullable: true })
	deliveryEmail: string | null;

	@Column({ name: 'delivery_email_subject', type: 'varchar', nullable: true })
	deliveryEmailSubject: string | null;

	@Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
	sentAt: Date | null;

	@Column({
		name: 'ci_tool_next_check_at',
		type: 'timestamptz',
		nullable: true,
	})
	nextCiToolCheckAt?: Date | null;

	@Column({
		name: 'ci_tool_job_id',
		type: 'varchar',
		nullable: true
	})
	ciToolJobId?: string | null;

	/** Tên step gốc để hiển thị, ví dụ: "Process Agg Ci.sendEmailToState" */
	@Column({ name: 'step_label', type: 'varchar', nullable: true })
	stepLabel: string | null;
}
