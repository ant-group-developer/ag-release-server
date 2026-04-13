import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedCustomIDEntity } from 'src/common/entities/user-tracked.entity';
import { ArtistProfile } from 'src/modules/artist-profile/entities/artist-profile.entity';
import { Country } from 'src/modules/country/entities/country.entity';
import { LENGTH_PICTURE } from 'src/modules/database/constants/database.constants';
import { DspCode } from 'src/modules/dsp/enum/dsp.enum';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { MediaUrlTransformer } from 'src/utils/util';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { ArtistSource } from '../enum/artist.enum';

@Entity('artists', {
	comment:
		'Dữ liệu gốc của nghệ sĩ, bao gồm định danh, thông tin mô tả và liên kết nền tảng',
})
export class Artist extends BaseUserTrackedCustomIDEntity {
	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		comment: 'Tên hiển thị của nghệ sĩ',
	})
	name: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_CODE,
		unique: true,
		comment: 'Mã nghệ sĩ duy nhất trong hệ thống',
	})
	code: string;

	@Column({
		type: 'varchar',
		length: LENGTH_PICTURE,
		nullable: true,
		comment: 'Ảnh đại diện của nghệ sĩ',
		transformer: MediaUrlTransformer,
	})
	picture: string | null;

	@Column({
		type: 'varchar',
		length: 250,
		nullable: true,
		comment: 'Tiểu sử ngắn của nghệ sĩ',
	})
	biography: string | null;

	@Column({
		type: 'enum',
		enum: ArtistSource,
		default: ArtistSource.ANT_MUSIC,
		comment: 'Nguồn dữ liệu khởi tạo nghệ sĩ',
	})
	artistSource: ArtistSource;

	@Column({
		type: 'varchar',
		length: 255,
		nullable: true,
		comment: 'ID nghệ sĩ từ hệ thống hoặc nguồn bên ngoài',
	})
	idSource: string;

	@Column({
		type: 'varchar',
		length: 10,
		nullable: true,
		comment: 'ID thể loại tham chiếu',
	})
	genreId: string | null;

	@Column({
		type: 'uuid',
		nullable: true,
		comment: 'ID quốc gia tham chiếu',
	})
	countryId: string | null;

	@Column({
		type: 'varchar',
		length: 255,
		nullable: true,
		comment: 'Thể loại chính theo DSP',
	})
	primaryGenre: string | null;

	@Column({
		type: 'varchar',
		length: 255,
		nullable: true,
		comment: 'Quốc gia xuất xứ theo DSP',
	})
	originCountry: string | null;

	@Column({
		type: 'boolean',
		default: false,
		comment: 'Đánh dấu nghệ sĩ đã được quét dữ liệu hay chưa',
	})
	isScanned: boolean;

	@OneToMany(() => ReleaseArtist, (releaseArtist) => releaseArtist.artist)
	releaseArtists: ReleaseArtist[];

	@OneToMany(() => TrackArtist, (trackArtist) => trackArtist.artist)
	trackArtists: TrackArtist[];

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	@OneToMany(() => ArtistProfile, (artistProfile) => artistProfile.artist)
	artistProfiles: ArtistProfile[];

	@ManyToOne(() => Genre, (genre) => genre.artists)
	@JoinColumn({ name: 'genre_id' })
	genre: Genre | null;

	@ManyToOne(() => Country)
	@JoinColumn({ name: 'country_id' })
	country: Country | null;

	releaseCount?: number;
	trackCount?: number;

	// nếu dùng thì nhớ phải join đủ
	get spotifyId(): string | undefined {
		const profileSpotify = this.artistProfiles.find(
			(p) => p.dsp.code === String(DspCode.SPOTIFY),
		);

		return extractIdFromUrl(profileSpotify?.url);
	}

	// nếu dùng thì nhớ phải join đủ
	get appleMusicId(): string | undefined {
		const profileApple = this.artistProfiles.find(
			(p) => p.dsp.code === String(DspCode.APPLE_MUSIC),
		);

		return extractIdFromUrl(profileApple?.url);
	}
}

function extractIdFromUrl(url?: string, type?: 'artist'): string | undefined {
	if (!url) return;

	try {
		const parsed = new URL(url);
		const parts = parsed.pathname.split('/').filter(Boolean);

		// Spotify: /artist/{id}
		if (parsed.hostname.includes('spotify')) {
			return parts[1]; // ["artist", "id"]
		}

		// Apple Music: /us/artist/name/{id}
		if (parsed.hostname.includes('apple')) {
			return parts[parts.length - 1];
		}

		return;
	} catch {
		return;
	}
}
