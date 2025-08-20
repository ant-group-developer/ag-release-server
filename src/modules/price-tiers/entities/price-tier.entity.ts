import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Currency } from 'src/modules/currency/entities/currency.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('price_tiers')
export class PriceTier extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'numeric', precision: 10, scale: 2 })
	amount: number;

	@Column({ type: 'uuid' })
	currencyId: string;

	@Column({ type: 'boolean', default: false })
	isDefault: boolean;

	@Column({ type: 'boolean', default: true })
	isActive: boolean;

	// relation
	@ManyToOne(() => Currency)
	@JoinColumn({ name: 'currency_id' })
	currency: Currency;

	@OneToMany(() => Track, (track) => track.priceTier)
	tracks: Track[];

	// virtual column
	trackCount?: number;
}
