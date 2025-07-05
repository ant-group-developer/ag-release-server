import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { ReleaseLanguage } from 'src/modules/release-language/entities/release-language.entity';
import { ReleaseLocalize } from 'src/modules/release-localize/entities/release-localize.entity';

import { COMMENT_FOR_NULLABLE } from 'src/common/constants/common.default.constants';
import { ReleaseCoverArt } from 'src/modules/release-cover-art/entities/release-cover-art.entity';
import { ReleaseDsp } from 'src/modules/release-dsp/entities/release-dsp.entity';
import { ReleaseTerritory } from 'src/modules/release-territories/entities/release-dsp.entity';
import { Timezone } from 'src/modules/timezone/entities/timezone.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { User } from 'src/modules/user/entities/user.entity';
import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
	OneToOne,
} from 'typeorm';
import { ReleaseStatus, ReleaseType } from '../enum/release.enum';

@Entity('releases')
export class Release extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: 20, nullable: true })
	upc: string | null;

	@Column({
		type: 'varchar',
		length: 10,
		nullable: true,
		comment: COMMENT_FOR_NULLABLE,
	})
	primaryGenreId: string | null;

	@Column({ type: 'varchar', length: 10, nullable: true })
	subGenreId: string | null;

	@Column({
		type: 'varchar',
		length: 10,
		nullable: true,
		comment: COMMENT_FOR_NULLABLE,
	})
	labelId: string | null;

	@Column({
		type: 'varchar',
		length: 150,
		nullable: true,
		comment: COMMENT_FOR_NULLABLE,
	})
	title: string;

	@Column({ type: 'varchar', length: 150, nullable: true })
	version: string | null;

	@Column({ type: 'enum', enum: ReleaseStatus, default: ReleaseStatus.DRAFT })
	status: ReleaseStatus;

	@Column({ type: 'enum', enum: ReleaseType })
	type: ReleaseType;

	@Column({ type: 'uuid', nullable: true, name: 'release_timezone_id' })
	releaseTimezoneId: string | null;

	@Column({
		type: 'varchar',
		length: 200,
		comment:
			'Example: 2025 Exclusive Licensed AMG' + '&' + COMMENT_FOR_NULLABLE,
		nullable: true,
	})
	cLineOwner: string | null;

	@Column({
		type: 'varchar',
		length: 200,
		comment:
			'Example: 2025 Exclusive Licensed AMG' + '&' + COMMENT_FOR_NULLABLE,
		nullable: true,
	})
	pLineOwner: string | null;

	@Column({
		type: 'varchar',
		length: 100,
		nullable: true,
	})
	catalogId: string | null;

	@Column({ type: 'date', comment: COMMENT_FOR_NULLABLE, nullable: true })
	releaseDate: Date | null;

	@Column({
		type: 'varchar',
		length: 10,
		nullable: true,
		comment: 'Format: HH:ss. Example: 18:00',
	})
	releaseTime: string | null;

	// relation
	@ManyToOne(() => Genre)
	@JoinColumn({ name: 'primary_genre_id' })
	primaryGenre?: Genre;

	@ManyToOne(() => Genre)
	@JoinColumn({ name: 'sub_genre_id' })
	subGenre: Genre | null;

	@ManyToOne(() => Label)
	@JoinColumn({ name: 'label_id' })
	label: Label;

	// tracks
	@OneToMany(() => Track, (track) => track.release)
	tracks: Track[];

	@OneToMany(() => ReleaseArtist, (releaseArtist) => releaseArtist.release)
	releaseArtists: ReleaseArtist[];

	@OneToOne(
		() => ReleaseLanguage,
		(releaseLanguage) => releaseLanguage.release,
	)
	releaseLanguage: ReleaseLanguage;

	@OneToMany(
		() => ReleaseLocalize,
		(releaseLocalize) => releaseLocalize.release,
	)
	releaseLocalizes: ReleaseLocalize[];

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	@ManyToOne(() => Timezone)
	@JoinColumn({ name: 'release_timezone_id' })
	timeZone: Timezone;

	@OneToMany(
		() => ReleaseCoverArt,
		(releaseCoverArt) => releaseCoverArt.release,
	)
	releaseCoverArt: ReleaseCoverArt[];

	@OneToMany(() => ReleaseDsp, (releaseDsp) => releaseDsp.release)
	releaseDsp: ReleaseDsp[];

	@OneToMany(() => ReleaseDsp, (releaseDsp) => releaseDsp.release)
	releaseTerritories: ReleaseTerritory[];
}

// @Entity('releases')
// export class Release extends BaseUserTrackedUUIDEntity {
// 	@Column({ type: 'varchar', length: 20, nullable: true })
// 	upc: string | null;

// 	@Column({ type: 'varchar', length: 10 })
// 	primaryGenreId: string;

// 	@Column({ type: 'varchar', length: 10, nullable: true })
// 	subGenreId: string | null;

// 	@Column({ name: 'label_id', type: 'varchar', length: 10 })
// 	labelId: string;

// 	@Column({ type: 'varchar', length: 150 })
// 	title: string;

// 	@Column({ type: 'varchar', length: 150, nullable: true })
// 	version: string | null;

// 	@Column({ type: 'enum', enum: ReleaseStatus, default: ReleaseStatus.DRAFT })
// 	status: ReleaseStatus;

// 	@Column({ type: 'enum', enum: ReleaseType })
// 	type: ReleaseType;

// 	@Column({ type: 'uuid', nullable: true, name: 'release_timezone_id' })
// 	releaseTimezoneId: string | null;

// 	@Column({
// 		type: 'varchar',
// 		length: 200,
// 		comment: 'Example: 2025 Exclusive Licensed AMG',
// 	})
// 	cLineOwner: string;

// 	@Column({
// 		type: 'varchar',
// 		length: 200,
// 		comment: 'Example: 2025 Exclusive Licensed AMG',
// 	})
// 	pLineOwner: string;

// 	@Column({
// 		type: 'varchar',
// 		length: 100,
// 		nullable: true,
// 	})
// 	catalogId: string | null;

// 	@Column({ type: 'date' })
// 	releaseDate: Date;

// 	@Column({
// 		type: 'varchar',
// 		length: 10,
// 		nullable: true,
// 		comment: 'Format: HH:ss. Example: 18:00',
// 	})
// 	releaseTime: string | null;

// 	// relation
// 	@ManyToOne(() => Genre)
// 	@JoinColumn({ name: 'primary_genre_id' })
// 	primaryGenre: Genre;

// 	@ManyToOne(() => Genre)
// 	@JoinColumn({ name: 'sub_genre_id' })
// 	subGenre: Genre | null;

// 	@ManyToOne(() => Label)
// 	@JoinColumn({ name: 'label_id' })
// 	label: Label;

// 	// tracks
// 	@OneToMany(() => Track, (track) => track.release)
// 	tracks: Track[];

// 	@OneToMany(() => ReleaseArtist, (releaseArtist) => releaseArtist.release)
// 	releaseArtists: ReleaseArtist[];

// 	@OneToOne(
// 		() => ReleaseLanguage,
// 		(releaseLanguage) => releaseLanguage.release,
// 	)
// 	releaseLanguage: ReleaseLanguage;

// 	@OneToMany(
// 		() => ReleaseLocalize,
// 		(releaseLocalize) => releaseLocalize.release,
// 	)
// 	releaseLocalizes: ReleaseLocalize[];

// 	@ManyToOne(() => User)
// 	@JoinColumn({ name: 'creator_id' })
// 	creator: User;

// 	@ManyToOne(() => User)
// 	@JoinColumn({ name: 'modifier_id' })
// 	modifier: User;

// 	@ManyToOne(() => Timezone)
// 	@JoinColumn({ name: 'release_timezone_id' })
// 	timeZone: Timezone;

// 	@OneToMany(
// 		() => ReleaseCoverArt,
// 		(releaseCoverArt) => releaseCoverArt.release,
// 	)
// 	releaseCoverArt: ReleaseCoverArt[];

// 	@OneToMany(() => ReleaseDsp, (releaseDsp) => releaseDsp.release)
// 	releaseDsp: ReleaseDsp[];

// 	@OneToMany(() => ReleaseDsp, (releaseDsp) => releaseDsp.release)
// 	releaseTerritories: ReleaseTerritory[];
// }
