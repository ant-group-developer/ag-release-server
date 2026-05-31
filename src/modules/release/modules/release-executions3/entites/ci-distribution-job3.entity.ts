import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ReleaseExecutionStep3 } from './release-execution3-step.entity';
import { ReleaseExecution3 } from './release-execution3.entity';

export enum CiJobType3 {
	EMAIL_STATE51 = 'EMAIL_STATE51',
	ADMIN_EXPORT = 'ADMIN_EXPORT',
}

export enum CiJobStatus3 {
	PENDING = 'PENDING',
	PROCESSING = 'PROCESSING',
	COMPLETED = 'COMPLETED',
	FAILED = 'FAILED',
	CANCEL = 'CANCEL',
}

// export enum CiJobStatus3 {
// 	PENDING = 'pending',
// 	PROCESSING = 'processing',
// 	COMPLETED = 'completed',
// 	FAILED = 'failed',
// 	CANCEL = 'cancel',
// }


@Entity('ci_distribution_jobs3')
export class CiDistributionJob3 extends BaseUUIDEntity {
	@Column({ type: 'varchar', length: 30 })
	type: CiJobType3;

	@Column({ type: 'varchar', nullable: true })
	upc: string | null;

	@Column({ type: 'varchar', nullable: true })
	note: string | null;

	@Column({ name: 'dsp_ci_codes', type: 'jsonb', default: [] })
	dspCiCodes: string[];

	@Column({ name: 'release_execution_id', type: 'uuid' })
	releaseExecutionId: string;

	@ManyToOne(() => ReleaseExecution3, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'release_execution_id' })
	releaseExecution: ReleaseExecution3;

	@Column({ name: 'step_id', type: 'uuid' })
	stepId: string;

	@ManyToOne(() => ReleaseExecutionStep3, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'step_id' })
	step: ReleaseExecutionStep3;

	@Column({ name: 'release_id', type: 'uuid', nullable: true })
	releaseId: string | null;

	@ManyToOne(() => Release, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@Column({
		type: 'varchar',
		length: 20,
		default: CiJobStatus3.PENDING,
	})
	status: CiJobStatus3;

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
	nextCiToolCheckAt: Date | null;

	@Column({
		name: 'ci_tool_job_id',
		nullable: true,
		type: 'varchar'
	})
	ciToolJobId: string | null;

	@Column({ name: 'step_label', type: 'varchar', nullable: true })
	stepLabel: string | null;
}
