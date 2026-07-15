import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import { SpotifyCatalogAvailability } from './spotify-catalog-availability.entity';

@Entity('spotify_catalog', {
	comment: 'Dữ liệu catalog từ Spotify Atlas API (effectiveData)',
})
export class SpotifyCatalog extends BaseUUIDEntity {
	@Column({ name: 'release_id', type: 'uuid', unique: true })
	releaseId: string;

	@Column({ name: 'album_uri', type: 'varchar', length: 255, nullable: true, comment: 'effectiveData.uri' })
	albumUri: string | null;

	@Column({ name: 'album_url', type: 'varchar', length: 512, nullable: true, comment: 'effectiveData.url' })
	albumUrl: string | null;

	@Column({
		name: 'artists',
		type: 'jsonb',
		nullable: true,
		comment: 'effectiveData.artists array đầy đủ',
	})
	artists: Array<{
		name: string;
		uri: string;
		role: string;
		avatarUri: string;
		isVerified: boolean;
		url: string;
	}> | null;

	@Column({
		name: 'catalog_deliveries',
		type: 'jsonb',
		nullable: true,
		comment: 'effectiveData.deliveries array (lịch sử delivery trong catalog)',
	})
	catalogDeliveries: Array<{
		deliveryId: string;
		action: string;
		deliveredAt: string;
		feedName: string;
		productId: string;
		feedGid: string;
		deliveryStatus: string;
		deliveryErrors: string[];
		deliveryErrorsAndTypes: Array<{ type: string; message: string }>;
		assetTranscodingStatuses: Array<{ assetType: string; status: string }>;
	}> | null;

	@Column({ name: 'synced_at', type: 'timestamptz', nullable: true })
	syncedAt: Date | null;

	@OneToOne(() => Release, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@OneToMany(() => SpotifyCatalogAvailability, (a) => a.catalog, { cascade: true })
	availability: SpotifyCatalogAvailability[];
}
