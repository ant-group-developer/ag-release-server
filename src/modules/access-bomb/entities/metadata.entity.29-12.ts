import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('release_29_12')
export class Release_29_12 {
	@PrimaryColumn({ type: 'bigint' })
	id: number;

	@Column({ name: 'release_title' })
	releaseTitle: string;

	@Column({ name: 'version_description', type: 'varchar', nullable: true })
	versionDescription: string | null;

	@Column()
	artist: string;

	@Column({ nullable: true, type: 'varchar' })
	gtin: string | null;

	@Column({ name: 'catalogue_no', nullable: true, type: 'varchar' })
	catalogueNo: string | null;

	@Column({ name: 'release_format_type' })
	releaseFormatType: string;

	@Column({ name: 'price_band' })
	priceBand: 'Mid';

	@Column({ name: 'territories', type: 'text' })
	licensedTerritoriesInclude: string;

	@Column({ name: 'release_start_date', type: 'date' })
	releaseStartDate: Date;

	@Column({ type: 'varchar', name: 'p_year', nullable: true })
	pYear: number;

	@Column({ type: 'varchar', name: 'p_holder', nullable: true })
	pHolder: string;

	@Column({ type: 'varchar', name: 'c_year', nullable: true })
	cYear: number | null;

	@Column({ name: 'c_holder', type: 'varchar', nullable: true })
	cHolder: string | null;

	@Column()
	label: string;

	@Column({ name: 'main_genre' })
	mainGenre: string;

	@Column({ name: 'alternate_genre', nullable: true, type: 'varchar' })
	alternateGenre: string | null;

	@Column({ name: 'primary_music_style_id', type: 'int', nullable: true })
	primaryMusicStyleId: number | null;

	@Column({ name: 'secondary_music_style_id', type: 'int', nullable: true })
	secondaryMusicStyleId: number | null;
}

// @Entity('track_29_12')
// export class Track_29_12 {
// 	// @PrimaryGeneratedColumn('uuid', { name: 'id' })
// 	// id: string;

// 	@PrimaryColumn({ name: 'id', type: 'bigint' })
// 	id: number;

// 	@Column({ name: 'release_id' })
// 	releaseId: string;

// 	@Column({ name: 'disc_number' })
// 	discNumber: number;

// 	@Column({ name: 'track_number' })
// 	trackNumber: number;

// 	@Column({ name: 'track_title' })
// 	trackTitle: string;

// 	@Column({ name: 'track_title_version', nullable: true })
// 	trackTitleVersion: string;

// 	@Column({ name: 'track_artist' })
// 	trackArtist: string;

// 	@Column({ name: 'track_isrc', nullable: true })
// 	trackISRC: string;

// 	@Column({ name: 'track_file_name', nullable: true })
// 	trackFileName: string;

// 	@Column({ name: 'duration' })
// 	duration: number;

// 	@Column({ name: 'track_price_code', nullable: true })
// 	trackPriceCode: string;

// 	@ManyToOne(() => Release, (release) => release.tracks, {
// 		onDelete: 'CASCADE',
// 	})
// 	@JoinColumn({ name: 'release_id' })
// 	release: Release;
// }
