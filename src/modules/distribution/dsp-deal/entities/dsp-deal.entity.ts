import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { DealType } from '../../deal-type/entities/deal-type.entity';
import { DspDealVisibility } from '../enum/dsp-deal.enum';

@Entity({ name: 'dsp_deals' })
@Index(['dspId', 'dealTypeId'], { unique: true })
export class DspDeal extends BaseUserTrackedUUIDEntity {
	@Column({ name: 'dsp_id', type: 'varchar' })
	dspId: string;

	@Column({ name: 'deal_type_id', type: 'uuid' })
	dealTypeId: string;

	@Column({ type: 'varchar', length: 20 })
	visibility: DspDealVisibility; // PUBLIC | ADMIN_ONLY

	@Column({ type: 'boolean', default: true })
	enabled: boolean;

	@Column({ type: 'int', default: 0 })
	order: number;

	@ManyToOne(() => Dsp, { eager: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'dsp_id' })
	dsp?: Dsp;

	@ManyToOne(() => DealType, { eager: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'deal_type_id' })
	dealType?: DealType;
}
