import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Logs } from 'src/modules/log/entites/logs.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { ReleaseError } from 'src/modules/release/modules/release-errors/entities/release-error.entity';
import { User } from 'src/modules/user/entities/user.entity';
import {
	AfterLoad,
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
} from 'typeorm';
import { ReleaseReview } from '../../release-reviews/entities/release-review.entity';
import {
	ExecutionType,
	ReleaseExecutionStatus,
} from '../enums/release-execution3.enum';
import { ReleaseExecutionResult3 } from './release-execution3-result.entity';
import { ReleaseExecutionStep3 } from './release-execution3-step.entity';

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

	@Column({ name: 'release_id', type: 'uuid' })
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

	@Column({ type: 'uuid', name: 'creator_id', nullable: true })
	creatorId: string | null;

	@ManyToOne(() => User, { nullable: true })
	@JoinColumn({ name: 'creator_id' })
	creator: User | null;

	@OneToMany(() => ReleaseExecutionStep3, (step) => step.releaseExecution)
	steps: ReleaseExecutionStep3[];

	@OneToMany(
		() => ReleaseExecutionResult3,
		(result) => result.releaseExecution,
	)
	results: ReleaseExecutionResult3[];

	@OneToMany(() => ReleaseError, (error) => error.releaseExecution)
	releaseErrors: ReleaseError[];

	@OneToMany(() => ReleaseReview, (review) => review.releaseExecution)
	releaseReview?: ReleaseReview[];

	@OneToMany(() => Logs, (log) => log.releaseExecution)
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
			dspDirect: Dsp[];
			reviewPolicy?: {
				tenantId: string;
				requiresManualReview: boolean;
			};
			dspAggregator: {
				ci: {
					ci: Dsp[];
					state51: Dsp[];
					primaryDsp?: Dsp | null;
					isSkipImport?: boolean;
				};
			};
			delivery?: {
				all?: ReleaseExecutionDeliveryInput;
				directByDspId?: Record<string, ReleaseExecutionDeliveryInput>;
				aggCi?: ReleaseExecutionDeliveryInput;
			};
			upcAutoIfReleaseSnapshotNull?: string;
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

export type ReleaseExecutionDeliveryInput = {
	releaseId: string;
	items: {
		id?: string;
		dspId?: string;
		dspCode: string;
	}[];
};
