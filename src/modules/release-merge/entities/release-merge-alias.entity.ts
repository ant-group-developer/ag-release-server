import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, Index } from 'typeorm';

@Entity('release_merge_aliases')
@Index(['targetReleaseId'])
export class ReleaseMergeAlias extends BaseUUIDEntity {
	@Column({ type: 'uuid', unique: true })
	sourceReleaseId: string;

	@Column({ type: 'uuid' })
	targetReleaseId: string;

	@Column({ type: 'uuid', nullable: true })
	mergeItemId: string | null;

	@Column({ type: 'varchar', length: 20, nullable: true })
	sourceUpc: string | null;

	@Column({ type: 'varchar', length: 150, nullable: true })
	sourceTitle: string | null;

	@Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
	sourceSnapshot: Record<string, unknown>;

	@Column({ type: 'timestamptz' })
	mergedAt: Date;
}
