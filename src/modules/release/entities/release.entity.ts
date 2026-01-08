import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { ReleaseLanguage } from 'src/modules/release-language/entities/release-language.entity';
import { ReleaseLocalize } from 'src/modules/release-localize/entities/release-localize.entity';

import { COMMENT_FOR_NULLABLE_DRAFT } from 'src/common/constants/common.default.constants';
import { AlbumFormat } from 'src/modules/album-format/entities/album-format.entity';
import { ReleaseContributor } from 'src/modules/release-contributor/entities/release-contributor.entity';
import { ReleaseCoverArt } from 'src/modules/release-cover-art/entities/release-cover-art.entity';
import { ReleaseDsp } from 'src/modules/release-dsp/entities/release-dsp.entity';
import { ReleaseTerritory } from 'src/modules/release-territory/entities/release-territory.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
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
import { ReleaseStatus, ReleaseTimeMode } from '../enum/release.enum';
import { ICoverArtThumbnails } from '../interfaces/release.interface';

@Entity('releases')
export class Release extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: 20, nullable: true })
	upc: string | null;

	@Column({ type: 'varchar', length: 10 })
	albumFormatId: string;

	@Column({
		type: 'varchar',
		length: 10,
		nullable: true,
		comment: COMMENT_FOR_NULLABLE_DRAFT,
	})
	primaryGenreId: string | null;

	@Column({ type: 'varchar', length: 10, nullable: true })
	subGenreId: string | null;

	@Column({
		type: 'varchar',
		length: 10,
		nullable: true,
		comment: COMMENT_FOR_NULLABLE_DRAFT,
	})
	labelId: string | null;

	@Column({
		type: 'varchar',
		length: 150,
		nullable: true,
		comment: COMMENT_FOR_NULLABLE_DRAFT,
	})
	title: string;

	@Column({ type: 'varchar', length: 150, nullable: true })
	version: string | null;

	@Column({ type: 'enum', enum: ReleaseStatus, default: ReleaseStatus.DRAFT })
	status: ReleaseStatus;

	@Column({
		type: 'int',
		comment: 'Example: 2025 ' + '&' + COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	cLineYear: number | null;

	@Column({
		type: 'varchar',
		length: 200,
		comment:
			'Example: Exclusive Licensed AMG' +
			'&' +
			COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	cLineOwner: string | null;

	@Column({
		type: 'int',
		comment: 'Example: 2025' + '&' + COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	pLineYear: number | null;

	@Column({
		type: 'varchar',
		length: 200,
		comment:
			'Example: Exclusive Licensed AMG' +
			'&' +
			COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	pLineOwner: string | null;

	@Column({
		type: 'varchar',
		length: 100,
		nullable: true,
	})
	catalogId: string | null;

	@Column({ type: Boolean, default: false })
	isVariousArtist: boolean;

	// release time
	@Column({
		type: 'enum',
		enum: ReleaseTimeMode,
		default: ReleaseTimeMode.GLOBAL_MIDNIGHT,
	})
	releaseTimeMode: ReleaseTimeMode;

	@Column({ type: 'uuid', nullable: true, name: 'release_timezone_id' })
	releaseTimezoneId: string | null;

	@Column({
		type: 'date',
		comment: COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	releaseDate: Date | null;

	@Column({
		type: 'varchar',
		length: 10,
		nullable: true,
		comment: 'Format: HH:ss. Example: 18:00',
	})
	releaseTime: string | null;

	// relation
	@ManyToOne(() => AlbumFormat)
	@JoinColumn({ name: 'album_format_id' })
	albumFormat: AlbumFormat;

	@ManyToOne(() => Genre)
	@JoinColumn({ name: 'primary_genre_id' })
	primaryGenre: Genre | null;

	@ManyToOne(() => Genre)
	@JoinColumn({ name: 'sub_genre_id' })
	subGenre: Genre | null;

	@ManyToOne(() => Label)
	@JoinColumn({ name: 'label_id' })
	label: Label | null;

	// tracks
	@OneToMany(() => Track, (track) => track.release)
	tracks: Track[];

	@OneToMany(() => ReleaseArtist, (releaseArtist) => releaseArtist.release)
	releaseArtists: ReleaseArtist[];

	@OneToMany(
		() => ReleaseContributor,
		(releaseContributor) => releaseContributor.release,
	)
	releaseContributors: ReleaseContributor[];

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
	releaseCoverArts?: ReleaseCoverArt[];

	@OneToMany(() => ReleaseDsp, (releaseDsp) => releaseDsp.release)
	releaseDsp: ReleaseDsp[];

	@OneToOne(
		() => ReleaseTerritory,
		(releaseTerritory) => releaseTerritory.release,
	)
	releaseTerritory: ReleaseTerritory | null;

	// count relation
	tracksCount?: number;
	totalDuration?: number;

	// virtual column
	coverArtThumbnails?: ICoverArtThumbnails;

	@Column({ type: 'uuid' })
	tenantId: string;

	@ManyToOne(() => Tenant)
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;
}
