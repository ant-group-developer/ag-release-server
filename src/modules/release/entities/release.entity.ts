import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { PriceTier } from 'src/modules/price-tiers/entities/price-tier.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { ReleaseLanguage } from 'src/modules/release-language/entities/release-language.entity';
import { ReleaseLocalize } from 'src/modules/release-localize/entities/release-localize.entity';

import {
	COMMENT_FOR_NULLABLE_DRAFT,
	DEFAULT_LENGTH_CODE,
} from 'src/common/constants/common.default.constants';
import { AlbumFormat } from 'src/modules/album-format/entities/album-format.entity';
import { RoutingModeEnum } from 'src/modules/distribution/dsp-routing/enum/dsp-routing.enum';
import { ReleaseCaption } from 'src/modules/release-caption/entities/release-caption.entity';
import { ReleaseContributor } from 'src/modules/release-contributor/entities/release-contributor.entity';
import { ReleaseCoverArt } from 'src/modules/release-cover-art/entities/release-cover-art.entity';
import { ReleaseTerritory } from 'src/modules/release-territory/entities/release-territory.entity';
import { ReleaseDspDelivery } from 'src/modules/release/entities/release-dsp-delivery.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { Timezone } from 'src/modules/timezone/entities/timezone.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Video } from 'src/modules/video/entities/video.entity';
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
import { ReleaseLog } from '../modules/release-log/entities/release-log.entity';

@Entity('releases', {
	comment:
		'Bảng phát hành (release), chứa metadata chính của album/single/EP',
})
export class Release extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'varchar',
		length: 20,
		comment: 'Video hay audio',
		default: 'audio',
	})
	type: 'audio' | 'video';

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
		nullable: true,
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
		type: 'uuid',
		nullable: true,
		comment: 'Price tier áp dụng cho release ' + COMMENT_FOR_NULLABLE_DRAFT,
	})
	priceTierId: string | null;

	@ManyToOne(() => PriceTier)
	@JoinColumn({ name: 'price_tier_id' })
	priceTier: PriceTier | null;

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
		type: 'boolean',
		default: false,
		comment:
			'Đánh dấu metadata đã được gửi sang CI Aggregator chung một mẻ chưa',
	})
	isSentMetadataCi: boolean;

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
		type: 'date',
		nullable: true,
		comment: 'Ngày kết thúc phát hành ' + COMMENT_FOR_NULLABLE_DRAFT,
	})
	releaseEndDate: Date | null;

	@Column({
		type: 'date',
		nullable: true,
		comment: 'Ngày phát hành gốc ' + COMMENT_FOR_NULLABLE_DRAFT,
	})
	releaseOriginalDate: Date | null;

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
	creator: User | null;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User | null;

	@ManyToOne(() => Timezone)
	@JoinColumn({ name: 'release_timezone_id' })
	timeZone: Timezone;

	@OneToMany(
		() => ReleaseCoverArt,
		(releaseCoverArt) => releaseCoverArt.release,
	)
	releaseCoverArts?: ReleaseCoverArt[];

	@OneToMany(() => ReleaseDspDelivery, (releaseDsp) => releaseDsp.release)
	releaseDspDeliveries: ReleaseDspDelivery[];

	@OneToOne(
		() => ReleaseTerritory,
		(releaseTerritory) => releaseTerritory.release,
	)
	releaseTerritory: ReleaseTerritory | null;

	@OneToOne(() => Video, (video) => video.release)
	video: Video | null;

	@OneToMany(() => ReleaseCaption, (caption) => caption.release)
	captions: ReleaseCaption[];

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
		type: 'jsonb',
		nullable: true,
		comment: 'Metadata spotify',
	})
	metadataSpotify: {
		folderBucket: string | null;
		folderServer: string | null;
	} | null;

	@OneToMany(() => ReleaseLog, (rL) => rL.release)
	logs: ReleaseLog[];

	// nếu dùng thì nhớ phải join đủ
	get listCodeExportCi() {
		return this.releaseDspDeliveries
			.map((r) => {
				if (
					r.dsp?.dspRoutingConfig?.mode ===
						RoutingModeEnum.AGGREGATOR &&
					r.dsp?.dspRoutingConfig?.aggregator?.code === 'CI'
				) {
					return r.dsp.codeCi;
				}
				return null;
			})
			.filter((code): code is string => Boolean(code?.trim()));
	}

	@Column({
		type: 'varchar',
		nullable: true,
		length: DEFAULT_LENGTH_CODE,
		// comment:
		// 	'Đường dẫn cho nghiệp vụ lấy ddex theo ern version tương ứng, ví dụ baseDirectDdex/3_8',
	})
	directDdexOnServer: string | null;

	sortTracksByOrderAsc() {
		if (this.tracks && Array.isArray(this.tracks)) {
			this.tracks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
		}
		return this;
	}
}
