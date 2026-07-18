import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { SpotifyCatalog } from './spotify-catalog.entity';

@Entity('spotify_catalog_delivery', {
	comment:
		'Lịch sử delivery trong catalog Spotify (effectiveData.deliveries từ API 3)',
})
@Unique('UQ_spotify_catalog_delivery_catalog_delivery_id', [
	'catalogId',
	'deliveryId',
])
export class SpotifyCatalogDelivery extends BaseUUIDEntity {
	@Index()
	@Column({ name: 'catalog_id', type: 'uuid' })
	catalogId: string;

	@Column({
		name: 'delivery_id',
		type: 'varchar',
		length: 100,
		comment: 'deliveries[].deliveryId',
	})
	deliveryId: string;

	@Column({
		name: 'action',
		type: 'varchar',
		length: 50,
		nullable: true,
		comment: 'insert / update / ...',
	})
	action: string | null;

	@Column({
		name: 'delivered_at',
		type: 'varchar',
		length: 30,
		nullable: true,
	})
	deliveredAt: string | null;

	@Column({ name: 'feed_name', type: 'varchar', length: 100, nullable: true })
	feedName: string | null;

	@Column({
		name: 'product_id',
		type: 'varchar',
		length: 50,
		nullable: true,
		comment: 'UPC',
	})
	productId: string | null;

	@Column({ name: 'source', type: 'varchar', length: 100, nullable: true })
	source: string | null;

	@Column({ name: 'feed_gid', type: 'varchar', length: 100, nullable: true })
	feedGid: string | null;

	@Column({
		name: 'delivery_status',
		type: 'varchar',
		length: 50,
		nullable: true,
		comment: 'Succeeded / Failed / ...',
	})
	deliveryStatus: string | null;

	@Column({
		name: 'delivery_errors',
		type: 'jsonb',
		nullable: true,
		comment: 'deliveryErrors array',
	})
	deliveryErrors: string[] | null;

	@Column({
		name: 'delivery_errors_and_types',
		type: 'jsonb',
		nullable: true,
		comment: 'deliveryErrorsAndTypes array — { type, message }',
	})
	deliveryErrorsAndTypes: Array<{ type: string; message: string }> | null;

	@Column({
		name: 'asset_transcoding_statuses',
		type: 'jsonb',
		nullable: true,
		comment: 'assetTranscodingStatuses array — { assetType, status }',
	})
	assetTranscodingStatuses: Array<{
		assetType: string;
		status: string;
	}> | null;

	@ManyToOne(() => SpotifyCatalog, (c) => c.catalogDeliveries, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'catalog_id' })
	catalog: SpotifyCatalog;
}
