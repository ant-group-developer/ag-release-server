import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { FileEntity } from 'src/modules/bucket/entities/bucket.file.entity';

import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('release_cover_art')
export class ReleaseCoverArt extends BaseUUIDEntity {
	@Column({ type: 'uuid' })
	fileId: string;

	@Column({ type: 'uuid' })
	releaseId: string;

	@Column({ type: 'int' })
	width: number;

	@Column({ type: 'int' })
	height: number;

	@Column({
		type: 'varchar',
		length: 20,
		comment: `Example: 75x75, 100x100, 160x160, 300x300, 900x900,  `,
	})
	type: string;

	// // relations
	@ManyToOne(() => FileEntity, (file) => file.releaseCoverArts)
	@JoinColumn({ name: 'file_id' })
	file: FileEntity;

	@ManyToOne(() => Release, (release) => release.releaseCoverArt)
	@JoinColumn({ name: 'release_id' })
	release: Release;
}
