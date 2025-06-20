import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Language } from 'src/modules/language/entities/language.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('release_localize')
export class ReleaseLocalize extends BaseUUIDEntity {
	@Column({ type: 'uuid' })
	languageId: string;

	@ManyToOne(() => Language)
	@JoinColumn({ name: 'language_id' })
	language: Language;

	@Column({ type: 'uuid' })
	releaseId: string;

	@ManyToOne(() => Release)
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@Column({ type: 'varchar', length: 150 })
	title: string;

	@Column({ type: 'varchar', length: 150, nullable: true })
	version: string | null;
}
