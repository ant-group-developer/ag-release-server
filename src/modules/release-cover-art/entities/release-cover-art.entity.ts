import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('release_cover_art')
export class ReleaseCoverArt extends BaseUUIDEntity {
	@Column({ type: 'varchar', length: 100 })
	fileName: string;

	@Column({ type: 'varchar', length: 100 })
	key: string;

	@Column({ type: 'varchar', length: 30 })
	contentType: string;

	@Column({ type: 'varchar', length: 10 })
	extension: string;

	@Column({ type: 'bigint', comment: 'store in bytes' })
	fileSize: number;

	@Column({ type: 'varchar', length: 30 })
	bucket: string;

	@Column({ type: 'uuid' })
	releaseId: string;

	@Column({ type: 'int' })
	width: number;

	@Column({ type: 'int' })
	height: number;

	@Column({
		type: 'varchar',
		length: 20,
		comment: `Example: 75x75, 100x100, 160x160, 300x300, 900x900, original`,
	})
	type: string;

	// // relations
	@ManyToOne(() => Release, (release) => release.releaseCoverArt)
	@JoinColumn({ name: 'release_id' })
	release: Release;
}
