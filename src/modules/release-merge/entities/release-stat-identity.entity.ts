import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, Index } from 'typeorm';

@Entity('release_stat_identities')
@Index(['releaseId'])
export class ReleaseStatIdentity extends BaseUUIDEntity {
	@Column({ type: 'varchar', length: 32 })
	statKey: string;

	@Column({ type: 'varchar', length: 10 })
	keyType: 'ISRC' | 'UPC';

	@Column({ type: 'uuid' })
	releaseId: string;

	@Column({ type: 'varchar', length: 10, nullable: true })
	trackId: string | null;

	@Column({ type: 'uuid', nullable: true })
	sourceReleaseId: string | null;

	@Column({ type: 'uuid', nullable: true })
	mergeItemId: string | null;

	@Column({ type: 'boolean', default: true })
	active: boolean;
}
