import { COMMENT_FOR_NULLABLE_DRAFT } from 'src/common/constants/common.default.constants';
import { BaseCustomIDEntity } from 'src/common/entities/base.entity';
import { AudioFile } from 'src/modules/audio-file/entities/audio-file.entity';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { TrackLanguage } from 'src/modules/track-language/entities/track-language.entity';
import { TrackLocalize } from 'src/modules/track-localize/entities/track-localize.entity';
import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
	OneToOne,
} from 'typeorm';

import { TrackScanHistory } from 'src/modules/copyright/entities/track-scan-history.entity';
import { PriceTier } from 'src/modules/price-tiers/entities/price-tier.entity';
import { TrackOriginType } from 'src/modules/track-origin-type/entities/track-origin-type.entity';
import { TrackPolicy } from 'src/modules/track-policy/entities/track-policy.entity';
import { TrackType } from 'src/modules/track-type/entities/track-type.entity';
import { ITrack } from '../interfaces/track.interface';

@Entity('tracks')
export class Track extends BaseCustomIDEntity implements ITrack {
	@Column({ type: 'varchar', length: 100 })
	title: string;

	@Column({
		type: 'varchar',
		length: 50,
		nullable: true,
		comment: `This will appear next to the track title excluding artist name. For example. 'Extended Version'This will appear next to the track title excluding artist name. For example. 'Extended Version'`,
	})
	version: string | null;

	@Column({ type: 'varchar', length: 20, nullable: true })
	isrc: string | null;

	@Column({ type: 'varchar', length: 20, nullable: true })
	iswc: string | null;

	@Column({ type: 'uuid' })
	releaseId: string;

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
			'Example: 2025 Exclusive Licensed AMG' +
			' & ' +
			COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	pLineOwner: string | null;

	@Column({
		type: 'varchar',
		length: 10,
		nullable: true,
		comment: COMMENT_FOR_NULLABLE_DRAFT,
	})
	primaryGenreId: string | null;

	@Column({ type: 'varchar', length: 10, nullable: true })
	subGenreId: string | null;

	@Column({ type: 'int', default: 0 })
	order: number;

	// other
	@Column({
		type: 'uuid',
		comment: COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	trackTypeId: string | null;

	@Column({
		type: 'uuid',
		comment: COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	trackOriginTypeId: string | null;

	@Column({ type: Boolean, nullable: true })
	isSensitiveContent: boolean;

	@Column({ type: 'text', nullable: true })
	lyric: string;

	@Column({ type: 'boolean', default: false })
	isScanned: boolean;

	@Column({ type: 'boolean', default: false })
	copyArtistsFromRelease: boolean;

	@Column({
		type: 'uuid',
		nullable: true,
		comment: COMMENT_FOR_NULLABLE_DRAFT,
	})
	priceTierId: string | null;

	// relation
	@ManyToOne(() => Release)
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@ManyToOne(() => Genre)
	@JoinColumn({ name: 'primary_genre_id' })
	primaryGenre: Genre | null;

	@ManyToOne(() => Genre)
	@JoinColumn({ name: 'sub_genre_id' })
	subGenre: Genre | null;

	@OneToMany(() => TrackArtist, (trackArtist) => trackArtist.track)
	trackArtists: TrackArtist[];

	@OneToOne(() => TrackLanguage, (trackLanguage) => trackLanguage.track)
	trackLanguage: TrackLanguage;

	@OneToMany(() => TrackLocalize, (trackLocalize) => trackLocalize.track)
	trackLocalizes: TrackLocalize[];

	@OneToOne(() => AudioFile, (audioFile) => audioFile.track)
	audioFile: AudioFile | null;

	@ManyToOne(() => TrackType)
	@JoinColumn({ name: 'track_type_id' })
	trackType: TrackType | null;

	@ManyToOne(() => TrackOriginType)
	@JoinColumn({ name: 'track_origin_type_id' })
	trackOriginType: TrackOriginType | null;

	@OneToMany(
		() => TrackScanHistory,
		(trackScanHistory) => trackScanHistory.track,
	)
	trackScanHistories?: TrackScanHistory[];

	@ManyToOne(() => PriceTier)
	@JoinColumn({ name: 'price_tier_id' })
	priceTier: PriceTier | null;

	@OneToMany(() => TrackPolicy, (trackPolicy) => trackPolicy.track)
	trackPolicies?: TrackPolicy[];
}
