import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'track_bomb' })
export class TrackBomb {
	@PrimaryColumn({ type: 'bigint' })
	id: number;

	@Column({ type: 'int' })
	disc_number: number;

	@Column({ type: 'int' })
	track_number: number;

	@Column({ type: 'varchar', length: 255 })
	track_title: string;

	@Column({ type: 'varchar', length: 255, nullable: true })
	track_title_version: string | null;

	@Column({ type: 'varchar', length: 255 })
	track_artist: string;

	@Column({ type: 'varchar', length: 32, nullable: true })
	track_isrc: string | null;

	@Column({ type: 'varchar', length: 255, nullable: true })
	track_file_name: string | null;

	@Column({ type: 'int' })
	duration: number;

	@Column({ type: 'varchar', length: 50, nullable: true })
	track_price_code: string | null;

	@Column({ type: 'boolean', nullable: true })
	available_separately: boolean | null;

	@Column({ type: 'boolean', nullable: true })
	explicit: boolean | null;

	@Column({ type: 'int', nullable: true })
	preview_start_seconds: number | null;

	@Column({ type: 'int', nullable: true })
	language_id: number | null;

	@Column({ type: 'boolean', nullable: true })
	has_vocals: boolean | null;

	@Column({ type: 'boolean', nullable: true })
	has_instruments: boolean | null;

	@Column({ type: 'varchar', length: 100, nullable: true })
	main_genre: string | null;

	@Column({ type: 'varchar', length: 100, nullable: true })
	sub_genre: string | null;

	@Column({ type: 'varchar', length: 100, nullable: true })
	alternate_genre: string | null;

	@Column({ type: 'varchar', length: 255, nullable: true })
	p_line_text: string | null;

	@Column({ type: 'int', nullable: true })
	p_line_year: number | null;

	@Column({ type: 'boolean', nullable: true })
	cleared_for_sale: boolean | null;

	@Column({ type: 'boolean', nullable: true })
	previously_released: boolean | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	artist_apple_id: string | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	artist_spotify_id: string | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	spotify_track_id: string | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	apple_track_id: string | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	deezer_track_id: string | null;

	@Column({ type: 'bigint' })
	release_id: number;

	@Column({ type: 'boolean', default: false })
	is_metadata_filled: boolean;
}
