import { BaseEntity } from 'src/common/entities/base.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Track } from '../track/entities/track.entity';

@Entity('track_revenue')
export class TrackRevenue extends BaseEntity {
	@Column({ type: 'date' })
	reportDate: Date;

	@Column({ type: 'varchar', length: 10 })
	dspId: string;

	@Column({ type: 'varchar', length: 2 })
	countryCode: string;

	@Column({ type: 'varchar', length: 3 })
	currencyCode: string;

	@Column({ type: 'numeric', precision: 24, scale: 21 })
	amount: number;

	@Column({ type: 'varchar' })
	trackId: string;

	@Column({ type: 'varchar' })
	configuration: string;

	@ManyToOne(() => Track)
	@JoinColumn({ name: 'track_id' })
	track: Track;
}
