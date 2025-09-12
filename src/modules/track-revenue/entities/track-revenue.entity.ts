import { BaseEntity } from 'src/common/entities/base.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Track } from '../../track/entities/track.entity';

@Entity('track_revenue')
export class TrackRevenue extends BaseEntity {
	// Transaction Date
	@Column({ type: 'date' })
	reportDate: Date;

	// Source
	@Column({ type: 'varchar', length: 10 })
	dspId: string;

	// Territory
	@Column({ type: 'varchar', length: 2 })
	countryCode: string;

	// Currency
	@Column({ type: 'varchar', length: 3 })
	currencyCode: string;

	// Net Amount
	@Column({ type: 'numeric', precision: 24, scale: 21 })
	amount: number;

	// Configuration
	@Column({ type: 'varchar' })
	configuration: string;

	@Column({ type: 'varchar' })
	trackId: string;

	@ManyToOne(() => Track)
	@JoinColumn({ name: 'track_id' })
	track: Track;

	@ManyToOne(() => Dsp)
	@JoinColumn({ name: 'dsp_id' })
	dsp: Dsp;
}
