import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
@Entity('release_ci')
export class ReleaseCi {
	@PrimaryColumn({ name: 'grouping_id', type: 'bigint', default: null })
	groupingId: null;

	//album_title
	@Column({ name: 'release_title' })
	releaseTitle: string;

	// album_title_version
	@Column({ name: 'version_description', nullable: true })
	versionDescription: string;

	// artist
	@Column({ name: 'artist' })
	artist: string;

	// albumUPC
	@Column({ name: 'gtin', nullable: true })
	gtin: string;

	// auto gen
	@Column({ name: 'catalogue_no', nullable: true })
	catalogueNo: string;

	// release_type
	@Column({ name: 'release_format_type' })
	releaseFormatType: string;

	// null
	@Column({ type: 'varchar', name: 'sound_carrier', nullable: true })
	soundCarrier: null;

	@Column({
		name: 'price_band',
		type: 'varchar',
		default: 'Mid',
		nullable: true,
	})
	priceBand: string;

	// territories
	@Column({
		name: 'licensed_territories_include',
		type: 'text',
		nullable: true,
	})
	licensedTerritoriesInclude: string;

	// null
	@Column({
		name: 'licensed_territories_exclude',
		type: 'text',
		nullable: true,
	})
	licensedTerritoriesExclude: null;

	//
	@Column({ name: 'release_start_date', type: 'date' })
	releaseStartDate: Date;

	@Column({ name: 'release_end_date', type: 'date', nullable: true })
	releaseEndDate: Date;

	// pLineYear
	@Column({ name: 'p_year', nullable: true })
	pYear: number;

	// pLineText
	@Column({ name: 'p_holder', nullable: true })
	pHolder: string;

	// cLineYear
	@Column({ name: 'c_year', nullable: true })
	cYear: number;

	// cLineText
	@Column({ name: 'c_holder', nullable: true })
	cHolder: string;

	// label
	@Column({ name: 'label', nullable: true })
	label: string;

	// join sang bảng genre, rồi lấy genre.name
	@Column({ name: 'main_genre', nullable: true })
	mainGenre: string;

	// bằng với mainGenre
	@Column({ name: 'main_sub_genre', nullable: true })
	mainSubGenre: string;

	// bằng với mainGenre
	@Column({ name: 'alternate_genre', nullable: true })
	alternateGenre: string;

	// bằng với mainGenre
	@Column({ name: 'alternate_sub_genre', nullable: true })
	alternateSubGenre: string;

	// N
	@Column({ name: 'explicit_content', default: 'N', nullable: true })
	explicitContent: string;

	// 1
	@Column({ name: 'volume_no', default: 1, nullable: true })
	volumeNo: number;

	@Column({ name: 'volume_total', default: 1, nullable: true })
	volumeTotal: number;

	@Column({ name: 'services', type: 'text', nullable: true })
	services: string;
}

@Entity('track_ci')
export class TrackCi {
	@PrimaryGeneratedColumn()
	id: number;

	// TRACK NO.
	@Column({ name: 'track_no', type: 'int' })
	trackNo: number;

	// TRACK TITLE
	@Column({ name: 'track_title', type: 'varchar', length: 255 })
	trackTitle: string;

	// MIX / VERSION
	@Column({
		name: 'mix_version',
		type: 'varchar',
		length: 255,
		nullable: true,
	})
	mixVersion: string;

	// ARTIST(S)
	@Column({ name: 'artists', type: 'text' })
	artists: string;

	// DISPLAY ARTIST
	@Column({ name: 'display_artist', type: 'text' })
	displayArtist: string;

	// ISRC
	@Column({ name: 'isrc', type: 'varchar', length: 32, nullable: true })
	isrc: string;

	// GRid
	@Column({ name: 'grid', type: 'varchar', length: 64, nullable: true })
	grid: string;

	// AVAILABLE SEPARATELY
	@Column({ name: 'available_separately', type: 'char', length: 1 })
	availableSeparately: string; // Y / N

	// (P) YEAR
	@Column({ name: 'p_year', type: 'int', nullable: true })
	pYear: number;

	// (P) HOLDER
	@Column({ name: 'p_holder', type: 'varchar', length: 255, nullable: true })
	pHolder: string;

	// (C) YEAR
	@Column({ name: 'c_year', type: 'int', nullable: true })
	cYear: number;

	// (C) HOLDER
	@Column({ name: 'c_holder', type: 'varchar', length: 255, nullable: true })
	cHolder: string;

	// GENRE(S) – Main
	@Column({
		name: 'main_genre',
		type: 'varchar',
		length: 100,
		nullable: true,
	})
	mainGenre: string;

	// Main SubGenre
	@Column({
		name: 'main_sub_genre',
		type: 'varchar',
		length: 100,
		nullable: true,
	})
	mainSubGenre: string;

	// Alternate Genre
	@Column({
		name: 'alternate_genre',
		type: 'varchar',
		length: 100,
		nullable: true,
	})
	alternateGenre: string;

	// Alternate SubGenre
	@Column({
		name: 'alternate_sub_genre',
		type: 'varchar',
		length: 100,
		nullable: true,
	})
	alternateSubGenre: string;

	// EXPLICIT CONTENT
	@Column({ name: 'explicit_content', type: 'char', length: 1 })
	explicitContent: string; // Y / N

	// PRODUCER(S)
	@Column({ name: 'producers', type: 'text', nullable: true })
	producers: string;

	// MIXER(S)
	@Column({ name: 'mixers', type: 'text', nullable: true })
	mixers: string;

	// COMPOSER(S)
	@Column({ name: 'composers', type: 'text', nullable: true })
	composers: string;

	// LYRICIST(S)
	@Column({ name: 'lyricists', type: 'text', nullable: true })
	lyricists: string;

	// PUBLISHER(S)
	@Column({ name: 'publishers', type: 'text', nullable: true })
	publishers: string;

	// HAS INSTRUMENTS?
	@Column({ name: 'has_instruments', type: 'char', length: 1 })
	hasInstruments: string; // Y / N

	// HAS VOCALS / LANGUAGE
	@Column({ name: 'has_vocals_language', type: 'varchar', length: 100 })
	hasVocalsLanguage: string;

	// PREVIEW START TIME (seconds)
	@Column({ name: 'preview_start_time', type: 'int', nullable: true })
	previewStartTime: number;

	// ORIGINAL RELEASE DATE
	@Column({ name: 'original_release_date', type: 'date', nullable: true })
	originalReleaseDate: Date;
}
