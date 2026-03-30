import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { FileEntity } from 'src/modules/bucket2/entities/bucket.file.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';

@Entity('release_cover_art', {
	comment: 'Ảnh bìa của release theo từng kích thước',
})
export class ReleaseCoverArt extends BaseUUIDEntity {
	@Column({
		type: 'uuid',
		comment: 'ID file ảnh bìa',
	})
	fileId: string;

	@Column({
		type: 'uuid',
		comment: 'ID release sở hữu ảnh bìa',
	})
	releaseId: string;

	@Column({
		type: 'int',
		comment: 'Chiều rộng ảnh (px)',
	})
	width: number;

	@Column({
		type: 'int',
		comment: 'Chiều cao ảnh (px)',
	})
	height: number;

	@Column({
		type: 'varchar',
		length: 20,
		comment: 'Loại kích thước ảnh (ví dụ: 75x75, 100x100, 300x300)',
	})
	type: string;

	@OneToOne(() => FileEntity)
	@JoinColumn({ name: 'file_id' })
	file: FileEntity;

	@ManyToOne(() => Release, (release) => release.releaseCoverArts)
	@JoinColumn({ name: 'release_id' })
	release: Release;
}
