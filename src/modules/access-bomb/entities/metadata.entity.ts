import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
	PrimaryColumn,
	PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('release_metadata')
export class ReleaseMetadata {
	@PrimaryGeneratedColumn('uuid', { name: 'id' })
	id: string;

	@Column({ name: 'release_type' })
	releaseType: string;

	@Column({ name: 'release_id' })
	releaseId: number;

	@Column({ name: 'album_upc', nullable: true })
	albumUPC: string;

	@Column({ name: 'album_id', nullable: true })
	albumId: string;

	@Column({ name: 'album_artist' })
	albumArtist: string;

	@Column({ name: 'album_title' })
	albumTitle: string;

	@Column({ name: 'album_title_version', nullable: true })
	albumTitleVersion: string;

	@Column({ name: 'disc_number' })
	discNumber: number;

	@Column({ name: 'track_number' })
	trackNumber: number;

	@Column({ name: 'track_id' })
	trackId: number;

	@Column({ name: 'track_title' })
	trackTitle: string;

	@Column({ name: 'track_title_version', nullable: true })
	trackTitleVersion: string;

	@Column({ name: 'track_artist' })
	trackArtist: string;

	@Column({ name: 'track_isrc', nullable: true })
	trackISRC: string;

	@Column({ name: 'track_file_name', nullable: true })
	trackFileName: string;

	@Column({ name: 'label', nullable: true })
	label: string;

	@Column({ name: 'original_release_date', type: 'date' })
	originalReleaseDate: Date;

	@Column({ name: 'category' })
	category: string;

	@Column({ name: 'duration' })
	duration: number;

	@Column({ name: 'p_line_year' })
	pLineYear: number;

	@Column({ name: 'p_line_text' })
	pLineText: string;

	@Column({ name: 'c_line_year', nullable: true })
	cLineYear: number;

	@Column({ name: 'c_line_text', nullable: true })
	cLineText: string;

	@Column({ name: 'album_price_code', nullable: true })
	albumPriceCode: string;

	@Column({ name: 'track_price_code', nullable: true })
	trackPriceCode: string;

	@Column({ name: 'territories', type: 'text', nullable: true })
	territories: string;

	@Column({ name: 'excluded_territories', type: 'text', nullable: true })
	excludedTerritories: string;

	keyAccessZip: string;
	keyAccessUnzip: string;
}

@Entity('release')
export class Release {
	@PrimaryColumn({ name: 'id', type: 'bigint' })
	id: number;

	// @Column({ name: 'release_type' })
	// releaseType: string;

	// @Column({ name: 'release_id' })
	// releaseId: number;

	@Column({ name: 'album_upc', nullable: true })
	albumUPC: string;

	@Column({ name: 'album_id', nullable: true })
	albumId: string;

	@Column({ name: 'album_artist' })
	albumArtist: string;

	@Column({ name: 'album_title' })
	albumTitle: string;

	@Column({ name: 'album_title_version', nullable: true })
	albumTitleVersion: string;

	@Column({ name: 'label', nullable: true })
	label: string;

	@Column({ name: 'original_release_date', type: 'date' })
	originalReleaseDate: Date;

	@Column({ name: 'category' })
	category: string;

	@Column({ name: 'p_line_year', nullable: true })
	pLineYear: number;

	@Column({ name: 'p_line_text', nullable: true })
	pLineText: string;

	@Column({ name: 'c_line_year', nullable: true })
	cLineYear: number;

	@Column({ name: 'c_line_text', nullable: true })
	cLineText: string;

	@Column({ name: 'album_price_code', nullable: true })
	albumPriceCode: string;

	@Column({ name: 'territories', type: 'text', nullable: true })
	territories: string;

	@Column({ name: 'excluded_territories', type: 'text', nullable: true })
	excludedTerritories: string;

	@OneToMany(() => Track, (track) => track.release)
	tracks: Track[];
}

@Entity('track')
export class Track {
	// @PrimaryGeneratedColumn('uuid', { name: 'id' })
	// id: string;
	@PrimaryColumn({ name: 'id', type: 'bigint' })
	id: number;

	@Column({ name: 'release_id' })
	releaseId: string;

	@Column({ name: 'disc_number' })
	discNumber: number;

	@Column({ name: 'track_number' })
	trackNumber: number;

	// @Column({ name: 'track_id' })
	// trackId: number;

	@Column({ name: 'track_title' })
	trackTitle: string;

	@Column({ name: 'track_title_version', nullable: true })
	trackTitleVersion: string;

	@Column({ name: 'track_artist' })
	trackArtist: string;

	@Column({ name: 'track_isrc', nullable: true })
	trackISRC: string;

	@Column({ name: 'track_file_name', nullable: true })
	trackFileName: string;

	@Column({ name: 'duration' })
	duration: number;

	@Column({ name: 'track_price_code', nullable: true })
	trackPriceCode: string;

	@ManyToOne(() => Release, (release) => release.tracks, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'release_id' })
	release: Release;
}
