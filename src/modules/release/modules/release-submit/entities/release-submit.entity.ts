import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { AfterLoad, Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { ReleaseSubmitStep } from './release-submit-step.entity';
import { ReleaseSubmitStatus } from '../release-submit.enum';
import { ReleaseSubmitLog } from './release-submit-log.entity';
import { ReleaseSubmitResultDto } from '../dto/release-submit.dto';

@Entity('release_submits')
export class ReleaseSubmit extends BaseUUIDEntity {
	@Column({
		name: 'release_id',
		type: 'uuid',
	})
	releaseId: string;

	@ManyToOne(() => Release, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@Column({
		type: 'enum',
		enum: ReleaseSubmitStatus,
		default: ReleaseSubmitStatus.NEW,
	})
	status: ReleaseSubmitStatus;

	@Column({
		type: 'jsonb',
		nullable: true,
		comment: 'Input data: releaseSnapshot, config, etc.',
	})
	metadata: {
        input: {
            releaseSnapshot: Release;
			dspCodes: string[];
        },
		output: {
			result: ReleaseSubmitResultDto[];
		}
    };

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

	@OneToMany(() => ReleaseSubmitStep, (step) => step.releaseSubmit)
	steps: ReleaseSubmitStep[];

	@OneToMany(() => ReleaseSubmitLog, (log) => log.releaseSubmit)
	logs: ReleaseSubmitLog[];

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