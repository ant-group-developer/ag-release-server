import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ReleaseSubmitStep } from './release-submit-step.entity';

@Entity('state51_emails')
export class State51Email extends BaseUUIDEntity {
	@Column({ type: 'varchar', nullable: true })
	upc: string | null;

	@Column({ name: 'dsp_ci_codes', type: 'jsonb', default: [] })
	dspCiCodes: string[];

	@Column({ name: 'delivery_email', type: 'varchar', nullable: true })
	deliveryEmail: string | null;

	@Column({ name: 'delivery_email_subject', type: 'varchar', nullable: true })
	deliveryEmailSubject: string | null;

	@Column({ name: 'is_sent', type: 'boolean', default: false })
	isSent: boolean;

	@Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
	sentAt: Date | null;

	/** FK tới step SEND_EMAIL_TO_STATE — để resume pipeline sau khi gửi */
	@Column({ name: 'release_submit_step_id', type: 'uuid', nullable: true })
	releaseSubmitStepId: string | null;

	@ManyToOne(() => ReleaseSubmitStep, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({ name: 'release_submit_step_id' })
	releaseSubmitStep: ReleaseSubmitStep | null;

	@Column({ name: 'release_id', type: 'uuid', nullable: true })
	releaseId: string | null;
}