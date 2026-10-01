import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import {
	ReleaseMergeRunStatus,
	ReleaseMergeTrigger,
} from '../enum/release-merge.enum';
import { ReleaseMergeItem } from './release-merge-item.entity';

@Entity('release_merge_runs')
@Index(['status', 'createdAt'])
export class ReleaseMergeRun extends BaseUUIDEntity {
	@Column({ type: 'enum', enum: ReleaseMergeTrigger })
	trigger: ReleaseMergeTrigger;

	@Column({ type: 'enum', enum: ReleaseMergeRunStatus })
	status: ReleaseMergeRunStatus;

	@Column({ type: 'uuid', nullable: true })
	requestedBy: string | null;

	@Column({ type: 'int', default: 0 })
	totalCandidates: number;

	@Column({ type: 'int', default: 0 })
	autoSafeCandidates: number;

	@Column({ type: 'int', default: 0 })
	manualCandidates: number;

	@Column({ type: 'int', default: 0 })
	appliedCandidates: number;

	@Column({ type: 'int', default: 0 })
	failedCandidates: number;

	@Column({ type: 'text', nullable: true })
	errorMessage: string | null;

	@Column({ type: 'timestamptz', nullable: true })
	completedAt: Date | null;

	@OneToMany(() => ReleaseMergeItem, (item) => item.run)
	items: ReleaseMergeItem[];
}
