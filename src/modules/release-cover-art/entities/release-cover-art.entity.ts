import { COMMENT_FOR_NULLABLE } from 'src/common/constants/common.default.constants';
import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { FileEntity } from 'src/modules/bucket/entities/bucket.file.entity';

import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';

@Entity('release_cover_art')
export class ReleaseCoverArt extends BaseUUIDEntity {
	@Column({ type: 'uuid', nullable: true, comment: COMMENT_FOR_NULLABLE })
	fileId: string | null;

	@Column({ type: 'uuid' })
	releaseId: string;

	@Column({ type: 'int', nullable: true, comment: COMMENT_FOR_NULLABLE })
	width: number | null;

	@Column({ type: 'int', nullable: true, comment: COMMENT_FOR_NULLABLE })
	height: number | null;

	@Column({
		type: 'varchar',
		length: 20,
		comment: `Example: 75x75, 100x100, 160x160, 300x300, 900x900,  `,
	})
	type: string;

	// // relations
	// @ManyToOne(() => FileEntity, (file) => file.releaseCoverArts)
	// @JoinColumn({ name: 'file_id' })
	// file: FileEntity;

	// @OneToOne(() => FileEntity, (file) => file.releaseCoverArt)
	// @JoinColumn({ name: 'file_id' })
	// file: FileEntity;

	@OneToOne(() => FileEntity)
	@JoinColumn({ name: 'file_id' })
	file: FileEntity;

	@ManyToOne(() => Release, (release) => release.releaseCoverArts)
	@JoinColumn({ name: 'release_id' })
	release: Release;
}
