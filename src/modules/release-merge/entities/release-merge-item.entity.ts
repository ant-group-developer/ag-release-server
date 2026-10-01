import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import {
	ReleaseMergeItemClassification,
	ReleaseMergeItemStatus,
} from '../enum/release-merge.enum';
import { ReleaseMergeRun } from './release-merge-run.entity';

@Entity('release_merge_items')
@Unique(['runId', 'sourceReleaseId'])
@Index(['runId', 'classification', 'status'])
@Index(['targetReleaseId'])
export class ReleaseMergeItem extends BaseUUIDEntity {
	@Column({ type: 'uuid' })
	runId: string;

	@Column({ type: 'uuid' })
	sourceReleaseId: string;

	@Column({ type: 'uuid', nullable: true })
	targetReleaseId: string | null;

	@Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
	candidateTargetReleaseIds: string[];

	@Column({ type: 'enum', enum: ReleaseMergeItemClassification })
	classification: ReleaseMergeItemClassification;

	@Column({ type: 'enum', enum: ReleaseMergeItemStatus })
	status: ReleaseMergeItemStatus;

	@Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
	reasonCodes: string[];

	@Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
	sharedIsrcs: string[];

	@Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
	sourceOnlyIsrcs: string[];

	@Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
	targetOnlyIsrcs: string[];

	@Column({ type: 'int', default: 0 })
	sourceTrackCount: number;

	@Column({ type: 'int', default: 0 })
	targetTrackCount: number;

	@Column({ type: 'boolean', default: false })
	upcEquivalent: boolean;

	@Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
	snapshot: Record<string, unknown>;

	@Column({ type: 'uuid', nullable: true })
	appliedBy: string | null;

	@Column({ type: 'timestamptz', nullable: true })
	appliedAt: Date | null;

	@Column({ type: 'text', nullable: true })
	errorMessage: string | null;

	@ManyToOne(() => ReleaseMergeRun, (run) => run.items, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'run_id' })
	run: ReleaseMergeRun;
}
