import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ReleaseSubmit } from './release-submit.entity';
import { ReleaseSubmitStep } from './release-submit-step.entity';
import { SubmitLogLevel } from '../release-submit.enum';

@Entity('release_submit_step_logs')
export class ReleaseSubmitLog extends BaseUUIDEntity {
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

	@Column({
		type: 'enum',
		enum: SubmitLogLevel,
		default: SubmitLogLevel.LOG,
	})
	level: SubmitLogLevel;

	@Column({ type: 'text', nullable: true })
	message: string | null;

	@Column({ type: 'jsonb', nullable: true })
	data: Record<string, any> | null;
}
