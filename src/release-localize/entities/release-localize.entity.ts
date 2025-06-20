import { LENGTH_ID } from 'src/database/const/database.const';
import { BaseEntityUUID } from 'src/database/entities/database.entity';
import { Language } from 'src/language/entities/language.entity';
import { Release } from 'src/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('release_localize')
export class ReleaseLocalize extends BaseEntityUUID {
	// @Column({
	// 	type: 'varchar',
	// 	length: LENGTH_ID.LANGUAGE,
	// 	name: 'language_id',
	// })
	@Column('uuid')
	languageId: string;

	@ManyToOne(() => Language)
	@JoinColumn({ name: 'language_id' })
	language: Language;

	@Column({ type: 'varchar', length: LENGTH_ID.RELEASE, name: 'release_id' })
	releaseId: string;

	@ManyToOne(() => Release)
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@Column({ type: 'varchar', length: 150 })
	title: string;

	@Column({ type: 'varchar', length: 150, nullable: true })
	version: string | null;
}
