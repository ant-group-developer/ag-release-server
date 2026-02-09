import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { ReleaseLanguage } from 'src/modules/release-language/entities/release-language.entity';
import { ReleaseLocalize } from 'src/modules/release-localize/entities/release-localize.entity';

import {
	COMMENT_FOR_NULLABLE_DRAFT,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { AlbumFormat } from 'src/modules/album-format/entities/album-format.entity';
// import { DspReleaseStatus } from 'src/modules/distribution2/dsp-release-status/entities/dsp-release-status.entity';
import { ReleaseContributor } from 'src/modules/release-contributor/entities/release-contributor.entity';
import { ReleaseCoverArt } from 'src/modules/release-cover-art/entities/release-cover-art.entity';
import { ReleaseDspDelivery } from 'src/modules/release-dsp/entities/release-dsp.entity';
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

@Entity('releases', {
	comment:
		'Bảng phát hành (release), chứa metadata chính của album/single/EP',
})
export class Release extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'varchar',
		length: 20,
		nullable: true,
		comment: 'Mã UPC của release',
	})
	upc: string | null;

	@Column({
		type: 'varchar',
		length: 10,
		comment: 'ID định dạng album (single, EP, album...)',
	})
	albumFormatId: string;

	@Column({
		type: 'varchar',
		length: 10,
		nullable: true,
		comment: 'Thể loại chính ' + COMMENT_FOR_NULLABLE_DRAFT,
	})
	primaryGenreId: string | null;

	@Column({
		type: 'varchar',
		length: 10,
		nullable: true,
		comment: 'Thể loại phụ',
	})
	subGenreId: string | null;

	@Column({
		type: 'varchar',
		length: 10,
		nullable: true,
		comment: 'Label phát hành ' + COMMENT_FOR_NULLABLE_DRAFT,
	})
	labelId: string | null;

	@Column({
		type: 'varchar',
		length: 150,
		nullable: true,
		comment: 'Tiêu đề release ' + COMMENT_FOR_NULLABLE_DRAFT,
	})
	title: string;

	@Column({
		type: 'varchar',
		length: 150,
		nullable: true,
		comment: 'Phiên bản release (Deluxe, Remastered...)',
	})
	version: string | null;

	@Column({
		type: 'enum',
		enum: ReleaseStatus,
		default: ReleaseStatus.DRAFT,
		comment: 'Trạng thái release (draft / submitted / published...)',
	})
	status: ReleaseStatus;

	@Column({
		type: 'int',
		nullable: true,
		comment: 'Năm C-Line (bản quyền ghi âm) ' + COMMENT_FOR_NULLABLE_DRAFT,
	})
	cLineYear: number | null;

	@Column({
		type: 'varchar',
		length: 200,
		nullable: true,
		comment: 'Chủ sở hữu C-Line ' + COMMENT_FOR_NULLABLE_DRAFT,
	})
	cLineOwner: string | null;

	@Column({
		type: 'int',
		nullable: true,
		comment:
			'Năm P-Line (bản quyền sản xuất) ' + COMMENT_FOR_NULLABLE_DRAFT,
	})
	pLineYear: number | null;

	@Column({
		type: 'varchar',
		length: 200,
		nullable: true,
		comment: 'Chủ sở hữu P-Line ' + COMMENT_FOR_NULLABLE_DRAFT,
	})
	pLineOwner: string | null;

	@Column({
		type: 'varchar',
		length: 100,
		nullable: true,
		comment: 'Mã catalog nội bộ',
	})
	catalogId: string | null;

	@Column({
		type: 'boolean',
		default: false,
		comment: 'Đánh dấu release nhiều nghệ sĩ (Various Artists)',
	})
	isVariousArtist: boolean;

	@Column({
		type: 'enum',
		enum: ReleaseTimeMode,
		default: ReleaseTimeMode.GLOBAL_MIDNIGHT,
		comment: 'Chế độ phát hành theo thời gian',
	})
	releaseTimeMode: ReleaseTimeMode;

	@Column({
		type: 'uuid',
		nullable: true,
		name: 'release_timezone_id',
		comment: 'ID múi giờ phát hành',
	})
	releaseTimezoneId: string | null;

	@Column({
		type: 'date',
		nullable: true,
		comment: 'Ngày phát hành ' + COMMENT_FOR_NULLABLE_DRAFT,
	})
	releaseDate: Date | null;

	@Column({
		type: 'varchar',
		length: 10,
		nullable: true,
		comment: 'Giờ phát hành (HH:mm)',
	})
	releaseTime: string | null;

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

	@OneToMany(() => ReleaseDspDelivery, (releaseDsp) => releaseDsp.release)
	releaseDsp: ReleaseDspDelivery[];

	@OneToOne(
		() => ReleaseTerritory,
		(releaseTerritory) => releaseTerritory.release,
	)
	releaseTerritory: ReleaseTerritory | null;

	tracksCount?: number;
	totalDuration?: number;

	coverArtThumbnails?: ICoverArtThumbnails;

	@Column({
		type: 'uuid',
		comment: 'ID tenant sở hữu release',
	})
	tenantId: string;

	@ManyToOne(() => Tenant)
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	// @Column({
	// 	type: 'varchar',
	// 	length: DEFAULT_LENGTH_NAME,
	// 	nullable: true,
	// 	comment:
	// 		'Prefix folder metadata CI trên bucket (ví dụ: releases/{releaseId}/release_metadata_ci/)',
	// })
	// prefixKeyBucketMetadataCi: string | null;

	@Column({
		type: 'jsonb',
		nullable: true,
		comment: 'Metadata CI info: { prefixKeyBucket, batchId }',
	})
	metadataCi: {
		folderBucket: string | null;
		folderServer: string | null;
		batchId: string | null;
	} | null;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		nullable: true,
		comment:
			'Prefix folder metadata Spotify trên bucket (ví dụ: releases/{releaseId}/release_metadata_spotify/)',
	})
	prefixKeyBucketMetadataSpotify: string | null;
}
