import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { ReleaseDspStatus } from 'src/modules/release/enum/release-dsp.enum';
import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ReleaseExecutionStep3 } from './release-execution3-step.entity';
import { ReleaseExecution3 } from './release-execution3.entity';

@Entity('release_execution_results3')
@Unique('uq_release_execution_results3_execution_dsp', [
	'releaseExecutionId',
	'dspId',
])
@Index('idx_release_execution_results3_release', ['releaseId'])
@Index('idx_release_execution_results3_step', ['releaseExecutionStepId'])
@Index('idx_release_execution_results3_status', ['status'])
export class ReleaseExecutionResult3 extends BaseUUIDEntity {
	@Column({ name: 'release_execution_id', type: 'uuid' })
	releaseExecutionId: string;

	@ManyToOne(() => ReleaseExecution3, (execution) => execution.results, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'release_execution_id' })
	releaseExecution: ReleaseExecution3;

	@Column({
		name: 'release_execution_step_id',
		type: 'uuid',
		nullable: true,
	})
	releaseExecutionStepId: string | null;

	@ManyToOne(() => ReleaseExecutionStep3, (step) => step.results, {
		onDelete: 'SET NULL',
		nullable: true,
	})
	@JoinColumn({ name: 'release_execution_step_id' })
	releaseExecutionStep: ReleaseExecutionStep3 | null;

	@Column({ name: 'release_id', type: 'uuid', nullable: true })
	releaseId: string | null;

	@ManyToOne(() => Release, { onDelete: 'CASCADE', nullable: true })
	@JoinColumn({ name: 'release_id' })
	release: Release | null;

	@Column({ name: 'dsp_id', type: 'varchar', length: 10 })
	dspId: string;

	@ManyToOne(() => Dsp, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'dsp_id' })
	dsp: Dsp;

	@Column({
		type: 'varchar',
		length: 50,
		default: ReleaseDspStatus.NEVER_DISTRIBUTED,
	})
	status: ReleaseDspStatus;
}
