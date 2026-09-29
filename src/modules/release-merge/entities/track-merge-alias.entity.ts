import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, Index } from 'typeorm';

@Entity('track_merge_aliases')
@Index(['targetTrackId'])
@Index(['isrc'])
export class TrackMergeAlias extends BaseUUIDEntity {
	@Column({ type: 'varchar', length: 10, unique: true })
	sourceTrackId: string;

	@Column({ type: 'varchar', length: 10 })
	targetTrackId: string;

	@Column({ type: 'varchar', length: 20, nullable: true })
	isrc: string | null;

	@Column({ type: 'uuid' })
	sourceReleaseId: string;

	@Column({ type: 'uuid' })
	targetReleaseId: string;

	@Column({ type: 'uuid', nullable: true })
	mergeItemId: string | null;
}
