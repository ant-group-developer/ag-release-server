import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { FileEntity } from 'src/modules/bucket2/entities/bucket.file.entity';
import { Language } from 'src/modules/language/entities/language.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import {
	Column,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	OneToOne,
} from 'typeorm';

export enum ReleaseCaptionType {
	SUBTITLE = 'SUBTITLE',
	CAPTION = 'CAPTION',
}

@Entity('release_captions', {
	comment:
		'Caption/subtitle files attached to a release, unique by language and type',
})
@Index(
	'UQ_release_captions_release_id_language_id_type',
	['releaseId', 'languageId', 'type'],
	{
		unique: true,
	},
)
export class ReleaseCaption extends BaseUUIDEntity {
	@Column({
		type: 'uuid',
		name: 'release_id',
		comment: 'ID release owning this caption',
	})
	releaseId: string;

	@ManyToOne(() => Release, (release) => release.captions, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@Column({
		type: 'uuid',
		name: 'language_id',
		comment: 'ID language selected for this caption/subtitle',
	})
	languageId: string;

	@ManyToOne(() => Language, {
		onDelete: 'RESTRICT',
	})
	@JoinColumn({ name: 'language_id' })
	language: Language;

	@Column({
		name: 'type',
		type: 'varchar',
		length: 20,
		default: 'CAPTION',
		comment: 'Caption file type: SUBTITLE or CAPTION',
	})
	type: ReleaseCaptionType;

	@Column({
		type: 'uuid',
		name: 'file_id',
		comment: 'Caption file id in bucket files table',
	})
	fileId: string;

	@OneToOne(() => FileEntity)
	@JoinColumn({ name: 'file_id' })
	file: FileEntity;
}
