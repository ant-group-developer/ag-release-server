import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, Index, ManyToOne, JoinColumn, Unique } from 'typeorm';

@Entity('spotify_delivery_status', {
	comment: 'Lịch sử delivery của release lên Spotify Sonar (API 1 + API 2)',
})
@Unique('UQ_spotify_delivery_status_release_delivery_feed', [
	'releaseId',
	'deliveryName',
	'feedGid',
])
export class SpotifyDeliveryStatus extends BaseUUIDEntity {
	@Index()
	@Column({ name: 'release_id', type: 'uuid' })
	releaseId: string;

	@Column({ name: 'spotify_id', type: 'varchar', length: 50, nullable: true })
	spotifyId: string | null;

	@Column({ name: 'feed_gid', type: 'varchar', length: 100 })
	feedGid: string;

	@Column({ name: 'delivery_name', type: 'varchar', length: 100 })
	deliveryName: string;

	@Column({ name: 'product_id', type: 'varchar', length: 50 })
	productId: string;

	@Column({ name: 'status', type: 'varchar', length: 50 })
	status: string;

	@Column({
		name: 'created_at_spotify',
		type: 'timestamptz',
		nullable: true,
		comment: 'createdAt từ Spotify API',
	})
	createdAtSpotify: Date | null;

	@Column({
		name: 'updated_at_spotify',
		type: 'timestamptz',
		nullable: true,
		comment: 'updatedAt từ Spotify API',
	})
	updatedAtSpotify: Date | null;

	@Column({ name: 'licensor_uuid', type: 'varchar', length: 50, nullable: true })
	licensorUuid: string | null;

	@Column({ name: 'licensor_name', type: 'varchar', length: 255, nullable: true })
	licensorName: string | null;

	@Column({ name: 'feed_name', type: 'varchar', length: 100, nullable: true })
	feedName: string | null;

	@Column({ name: 'album_uri', type: 'varchar', length: 255, nullable: true, comment: 'spotify:album:xxx' })
	albumUri: string | null;

	@Column({ name: 'artist_names', type: 'jsonb', nullable: true, comment: 'Mảng tên nghệ sĩ từ albumMetadata' })
	artistNames: string[] | null;

	@Column({ name: 'album_name', type: 'varchar', length: 255, nullable: true })
	albumName: string | null;

	@Column({ name: 'cover_art_sha1', type: 'jsonb', nullable: true, comment: '{ small, medium, large } sha1digest' })
	coverArtSha1: Record<string, string> | null;

	@Column({ name: 'earliest_start_date', type: 'timestamptz', nullable: true })
	earliestStartDate: Date | null;

	@Column({
		name: 'validation_errors',
		type: 'jsonb',
		nullable: true,
		comment: 'Mảng lỗi từ validationStatus.errors (API 2)',
	})
	validationErrors: string[] | null;

	@Column({ name: 'is_provider_test', type: 'boolean', default: false })
	isProviderTest: boolean;

	@Column({ name: 'warning_status', type: 'varchar', length: 50, nullable: true })
	warningStatus: string | null;

	@Column({ name: 'warning_count', type: 'integer', default: 0 })
	warningCount: number;

	@ManyToOne(() => Release, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'release_id' })
	release: Release;
}
