import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { SpotifyCatalog } from './spotify-catalog.entity';

@Entity('spotify_catalog_availability', {
	comment: 'Availability theo quốc gia từ Spotify Atlas (1 row = 1 quốc gia)',
})
@Unique('UQ_spotify_catalog_availability_catalog_country', [
	'catalogId',
	'countryCode',
])
export class SpotifyCatalogAvailability extends BaseUUIDEntity {
	@Index()
	@Column({ name: 'catalog_id', type: 'uuid' })
	catalogId: string;

	@Column({ name: 'country_code', type: 'char', length: 2 })
	countryCode: string;

	@Column({
		name: 'delivered_start',
		type: 'varchar',
		length: 30,
		nullable: true,
	})
	deliveredStart: string | null;

	@Column({
		name: 'delivered_end',
		type: 'varchar',
		length: 30,
		nullable: true,
	})
	deliveredEnd: string | null;

	@Column({
		name: 'effective_start',
		type: 'varchar',
		length: 30,
		nullable: true,
	})
	effectiveStart: string | null;

	@Column({
		name: 'effective_end',
		type: 'varchar',
		length: 30,
		nullable: true,
	})
	effectiveEnd: string | null;

	@Column({ name: 'status', type: 'varchar', length: 50, nullable: true })
	status: string | null;

	@ManyToOne(() => SpotifyCatalog, (c) => c.availability, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'catalog_id' })
	catalog: SpotifyCatalog;
}
